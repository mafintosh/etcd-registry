#!/usr/bin/env node

var registry = require('./');
var net = require('net');
var path = require('path');

if (process.argv.length < 5) {
	console.error('Usage: etcd-registry [connection-string] [service-name] [index-file.js]');
	process.exit(1);
}

var services = registry(process.argv[2]);
var name = process.argv[3];

var server = net.createServer();
var Server = net.Server;

var listen = Server.prototype.listen;
var req = process.argv[4];

server.listen(0, function() {
	var port = server.address().port;

	Server.prototype.listen = function(p) {
		if (String(port) !== String(p)) return listen.apply(this, arguments);

		this.on('listening', function() {
			services.join(name, port);

			var onclose = function() {
				services.leave(function() {
					process.exit(0);
				});
			};

			process.on('SIGINT', onclose);
			process.on('SIGTERM', onclose);
		});

		return listen.apply(this, arguments);
	};

	server.close(function() {
		process.env.PORT = port;
		require(path.join(process.cwd(), req));
	});
});
