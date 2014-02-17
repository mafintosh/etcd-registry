var request = require('request');
var events = require('events');
var address = require('network-address');
var qs = require('querystring');
var roundround = require('roundround');

request = request.defaults({
	timeout: 10000
});

var noop = function() {};

var registry = function(url) {
	if (!url) url = '127.0.0.1';

	var parsed = url.match(/^([^:]+:\/\/)?([^\/]+)(?:\/([^\?]+))?(?:\?(.+))?$/);
	if (!parsed) throw new Error('Invalid connection string');

	var protocol = parsed[1] || 'http://';
	var ns = (parsed[3] || '').replace(/^\//, '').replace(/([^\/])$/, '$1/');
	var urls = parsed[2].split(/,\s*/).map(function(url) {
		if (url.indexOf(':') === -1) url += ':4001';
		return protocol+url;
	});

	var that = new events.EventEmitter();
	var services = [];
	var prev = urls.join(', ');

	var req = function(path, opts, cb) {
		var tries = urls.length;
		var offset = (Math.random() * urls.length) | 0;
		var next = roundround(urls, offset);

		var loop = function() {
			request(opts.location || (next()+path), opts, function onresponse(err, response) {
				if (err) {
					if (opts.location) delete opts.location;
					if (--tries <= 0) return cb(err);
					return setTimeout(loop, 1000);
				}

				if (response.statusCode === 307) return request(opts.location = response.headers.location, opts, onresponse);
				if (response.statusCode === 404) return cb();
				if (response.statusCode > 299) return cb(new Error('bad status code ('+response.statusCode+')'));

				cb(null, response.body);
			});
		};

		loop();
	};

	var refresh = function() {
		req('/v2/machines', {}, function(err, body) {
			if (err || !body || prev === body) return setTimeout(refresh, 60000).unref();
			prev = body;
			urls = body.split(/,\s*/);
			that.emit('machines', urls);
			setTimeout(refresh, 60000).unref();
		});
	};

	refresh();

	that.join = function(name, service, cb) {
		if (typeof service === 'number') service = {port:service};
		if (typeof service === 'function') return that.join(name, null, service);
		if (!service) service = {};

		service.name = name;
		service.hostname = service.hostname || address();
		service.host = service.port ? service.hostname+':'+service.port : service.hostname;
		service.url = service.url || (service.protocol || 'http')+'://'+service.host;

		var path = '/v2/keys/services/'+ns+name+'/'+service.url.replace(/[:\/]+/g, '-');
		var body = qs.stringify({
			value:JSON.stringify(service),
			ttl:10
		});

		var clone = {};
		Object.keys(service).forEach(function(key) {
			clone[key] = service[key];
		});

		service.key = path;
		services.push(service);

		var opts = {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
			},
			body: body
		};

		var ping = function(cb) {
			req(path, opts, function(err, body) {
				cb(err);
			});
		};

		var keepAlive = function() {
			ping(function(err) {
				service.timeout = setTimeout(keepAlive, err ? 15000 : 5000);
				service.timeout.unref();
			});
		};

		ping(function(err) {
			service.timeout = setTimeout(keepAlive, 5000);
			service.timeout.unref();
			if (cb) cb(err, clone);
		});
	};

	that.leave = function(name, cb) {
		if (typeof name === 'function') return that.leave(null, name);
		if (!cb) cb = noop;

		var list = services.filter(function(service) {
			return !name || service.name === name;
		});

		if (!list.length) return cb();

		var loop = function() {
			if (!list.length) return cb();
			var service = list.shift();
			clearTimeout(service.timeout);
			req(service.key, {method:'DELETE'}, loop);
		};

		loop();
	};

	var flatten = function(nodes) {
		var result = [];
		nodes.forEach(function visit(node) {
			if (node.nodes) return node.nodes.forEach(visit);
			if (node.value) result.push(node.value);
		});
		return result;
	};

	that.list = function(name, cb) {
		if (typeof name === 'function') return that.list(null, name);
		req('/v2/keys/services/'+ns+(name || ''), {json:true, qs:{recursive:true}}, function(err, body) {
			if (err) return cb(err);
			if (!body || !body.node || !body.node.nodes) return cb(null, []);

			var vals = [];
			flatten(body.node.nodes).forEach(function(node) {
				try {
					vals.push(JSON.parse(node));
				} catch (err) {
					// do nothing ...
				}
			});

			cb(null, vals);
		});
	};

	that.lookup = function(name, cb) {
		if (typeof name === 'function') return that.lookup(null, name);
		req('/v2/keys/services/'+ns+(name || ''), {json:true, qs:{recursive:true}}, function(err, body) {
			if (err) return cb(err);
			if (!body || !body.node || !body.node.nodes) return cb();

			var nodes = flatten(body.node.nodes);
			if (!nodes.length) return cb();

			var node = nodes[(Math.random() * nodes.length) | 0];
			if (!node) return cb();

			try {
				node = JSON.parse(node);
			} catch (err) {
				return cb(err);
			}

			cb(null, node);
		});
	};

	return that;
};

module.exports = registry;