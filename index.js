var request = require('request');
var events = require('events');
var address = require('network-address');
var qs = require('querystring');
var roundround = require('roundround');

request = request.defaults({
	timeout: 10000
});

var noop = function() {};

var encode = function(str) {
	return encodeURIComponent(str.replace(/[\/:]+/g, '-'));
};

var registry = function(url) {
	if (Array.isArray(url)) url = url.join(',');

	var protocol = url.indexOf('://') > -1 ? url.split('://')[0]+'://' : 'http://';
	var urls = url.replace(protocol, '').split(/,\s*/).map(function(url) {
		return protocol+url;
	});

	var that = new events.EventEmitter();
	var services = [];
	var prev = urls.join(', ');

	var req = function(path, opts, cb) {
		var tries = urls.length;
		var next = roundround(urls);

		var loop = function() {
			request(next()+path, opts, function onresponse(err, response) {
				if (err) {
					if (--tries <= 0) return cb(err);
					return setTimeout(loop, 1000);
				}

				if (response.statusCode === 307) return request(response.headers.location, opts, onresponse);
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

	that.join = function(name, port, service, cb) {
		if (typeof service === 'function') return that.join(name, port, null, service);
		if (!service) service = {};

		service.name = name;
		service.port = port;
		service.hostname = service.hostname || address();
		service.host = service.hostname+':'+service.port;
		service.url = service.url || (service.protocol || 'http')+'://'+service.host;

		var path = '/v2/keys/'+encode(name)+'/'+encode(service.url);
		var body = qs.stringify({
			value:JSON.stringify(service),
			ttl:10
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
				service.timeout = setTimeout(keepAlive, err ? 15000 : 5000).unref();
			});
		};

		ping(function(err) {
			service.timeout = setTimeout(keepAlive, 5000).unref();
			if (cb) cb(err);
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
			var next = list.shift();
			req(next.key, {method:'DELETE'}, function() {
				loop();
			});
		};

		loop();
	};

	that.list = function(name, cb) {
		req('/v2/keys/'+encode(name), {json:true, qs:{recursive:true}}, function(err, body) {
			if (err) return cb(err);
			if (!body || !body.node || !body.node.nodes) return cb(null, []);

			var vals = [];
			body.node.nodes.forEach(function(node) {
				try {
					vals.push(JSON.parse(node.value));
				} catch (err) {
					// do nothing ...
				}
			});

			cb(null, vals);
		});
	};

	that.lookup = function(name, cb) {
		req('/v2/keys/'+encode(name), {json:true, qs:{recursive:true}}, function(err, body) {
			if (err) return cb(err);
			if (!body || !body.node || !body.node.nodes) return cb();

			var nodes = body.node.nodes;
			if (!nodes.length) return cb();

			var node = nodes[(Math.random() * nodes.length) | 0];
			if (!node) return cb();

			try {
				node = JSON.parse(node.value);
			} catch (err) {
				return cb(err);
			}

			cb(null, node);
		});
	};

	refresh();

	return that;
};

module.exports = registry;