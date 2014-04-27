var etcdjs = require('etcdjs');
var LRU = require('lru-cache');
var crypto = require('crypto');
var address = require('network-address');
var querystring = require('querystring');

var noop = function() {};

var sha1 = function(val) {
	return crypto.createHash('sha1').update(val).digest('hex');
};

var parseSetting = function(val) {
	if (!val) return undefined;
	if (val === 'false') return false;
	if (val === 'true') return true;
	if (/^\d+$/.test(val)) return parseInt(val, 10);
	return val;
};

var parseConnectionString = function(url) {
	if (!url || typeof url === 'object') return url || {};

	var parsed = url.match(/^([^:]+:\/\/)?([^\/]+)(?:\/([^\?]+))?(?:\?(.+))?$/);
	if (!parsed) throw new Error('Invalid connection string');

	var opts = {};
	var protocol = parsed[1] || 'http://';
	var qs = querystring.parse(url.split('?')[1]);

	opts.namespace = parsed[3] || '';
	opts.refresh = !!parseSetting(qs.refresh);
	opts.cache = parseSetting(qs.cache);

	opts.hosts = parsed[2].split(/,\s*/).map(function(url) {
		return protocol+url;
	});

	return opts;
};

module.exports = function(opts) {
	opts = parseConnectionString(opts);

	var store = etcdjs(opts);
	var cache = LRU(opts.cache || 100);

	var destroyed = false;
	var onreset = function() {
		cache.reset();
	};

	var ns = (opts.namespace || '').replace(/^\//, '').replace(/([^\/])$/, '$1/');
	var prefix = function(key) {
		return 'registry/'+ns+key;
	};

	var cacheTimeout;
	var cacheBuster = function() {
		store.get(prefix('updated'), function onupdated(err, first) {
			if (destroyed) return;
			if (err) return cacheTimeout = setTimeout(cacheBuster, 5000);
			if (!first) return store.set(prefix('updated'), new Date().toISOString(), onupdated);

			onreset();

			store.wait(prefix('updated'), {waitIndex:first.node.modifiedIndex+1}, function onwait(err, result, next) {
				if (destroyed) return;
				if (err) return cacheTimeout = setTimeout(cacheBuster, 5000);

				onreset();
				next(onwait);
			});
		});
	};

	var that = {};
	var services = [];

	var normalize = function(key) {
		return key.replace(/[^a-zA-Z0-9\-]/g, '-');
	};

	that.join = function(name, service, cb) {
		if (typeof service === 'function') return that.join(name, null, service);
		if (typeof service === 'number') service = {port:service};
		if (!service) service = {};
		if (!cb) cb = noop;

		service.name = name;
		service.hostname = service.hostname || address();
		service.host = service.host || (service.port ? service.hostname + ':' + service.port : service.hostname);
		service.url = service.url || (service.protocol || 'http')+'://'+service.host;

		var key = prefix('services/'+normalize(name)+'/'+sha1(name+'-'+service.url));
		var value = JSON.stringify(service);
		var entry = {name:name, key:key, destroyed:false, timeout:null};

		var update = function(cb) {
			store.set(key, value, {ttl:10}, cb);
		};

		var loop = function() {
			update(function(err) {
				if (entry.destroyed) return;
				entry.timeout = setTimeout(loop, err ? 15000 : 5000);
			});
		};

		var onerror = function(err) {
			leave([entry], function() {
				cb(err);
			});
		};

		services.push(entry);
		update(function(err) {
			if (err) return onerror(err);
			if (destroyed) return onerror(new Error('registry destroyed'));

			store.set(prefix('updated'), new Date().toISOString(), function(err) {
				if (err) return onerror(err);
				if (destroyed) return onerror(new Error('registry destroyed'));

				entry.timeout = setTimeout(loop, 5000);
				cb(null, service);
			});
		});
	};

	that.lookup = function(name, cb) {
		if (typeof name === 'function') return that.lookup(null, name);

		that.list(name, function(err, list) {
			if (err) return cb(err);
			if (!list.length) return cb(null, null);
			cb(null, list[(Math.random() * list.length) | 0]);
		});
	};

	var flatten = function(result, node) {
		if (node.value) result.push(node);
		if (!node.nodes) return result;

		node.nodes.forEach(function(node) {
			flatten(result, node);
		});

		return result;
	};

	var nextTick = function(cb, err, val) {
		process.nextTick(function() {
			cb(err, val);
		});
	};

	that.list = function(name, cb) {
		if (typeof name === 'function') return that.list(null, name);
		if (name) name = normalize(name);

		var cached = cache.get(name || '*');
		if (cached) return nextTick(cb, null, cached);

		store.get(prefix('services/'+(name || '')), {recursive:true}, function(err, result) {
			if (err) return cb(err);
			if (!result) return cb(null, []);

			var list = flatten([], result.node)
				.map(function(node) {
					try {
						return JSON.parse(node.value);
					} catch (err) {
						return null;
					}
				})
				.filter(function(val) {
					return val;
				});

			cache.set(name || '*', list);

			cb(null, list);
		});
	};

	var leave = function(list, cb) {
		var loop = function() {
			var next = list.shift();

			if (!next) return store.set(prefix('updated'), new Date().toISOString(), cb);

			clearTimeout(next.timeout);
			next.destroyed = true;

			var i = services.indexOf(next);
			if (i > -1) services.splice(next, 1);

			store.del(next.key, loop);
		};

		loop();
	};

	that.leave = function(name, cb) {
		if (typeof name === 'function') return that.destroy(cb); // backwards compat

		var list = services.filter(function(entry) {
			return entry.name === name;
		});

		leave(list, cb || noop);
	};

	that.destroy = function(cb) {
		clearTimeout(cacheTimeout);
		destroyed = true;
		leave(services, function(err) {
			store.destroy();
			if (cb) return cb();
		});
	};

	return that;
};