#!/usr/bin/env node

var registry = require('./');
var optimist = require('optimist');
var path = require('path');
var chalk = require('chalk');
var freeport = require('freeport');
var tree = require('pretty-tree');
var net = require('net');
var address = require('network-address');

var argv = optimist
	.usage('Usage: $0 [command] [options]')
	.option('e', {
		alias: 'etcd',
		default: '127.0.0.1:4001'
	})
	.option('v', {
		alias: 'verbose',
		default: false
	})
	.option('p', {
		alias: 'port',
		default: 0
	})
	.option('h', {
		alias: 'hostname',
		default: address()
	})
	.option('w', {
		alias: 'wait',
		default: 2000
	})
	.option('s', {
		alias: 'slack',
		default: 5000
	})
	.argv;

var services = registry(argv.etcd + (argv.etcd.indexOf('?') === -1 ? '?refresh=false' : '&refresh=false'));
var cmds = {};
var _ = argv._;

var help = function() {
	optimist.showHelp();
	console.error('Commands:')
	console.error('  join [name] [index.js]  # Listen on env.PORT to join the registry in index.js');
	console.error('  list                    # List all added services');
	console.error('  lookup [name]           # Lookup a specific service');
	console.error('');
	process.exit(1);
};

var error = function(err) {
	console.error(chalk.red(err.message || err));
	process.exit(2);
};

var usage = function(msg) {
	console.error('Usage: '+argv.$0+' '+msg);
	process.exit(2);
};

cmds.join = function(name, main) {
	if (!name || !main) return usage('join [name] [main]');

	var onport = function(port) {
		process.env.PORT = ''+port;

		var join = function() {
			services.join(name, {port:port, hostname:argv.hostname}, function(err) {
				if (err) return error(err);

				var pexit = process.exit;

				process.exit = function(code) {
					services.leave(function() {
						pexit(code);
					});
				};

				process.on('SIGTERM', function() {
					var leave = function() {
						services.leave(function() {
							if (!argv.slack) return pexit();
							setTimeout(argv.slack, pexit);
						});
					};

					if (!argv.wait) return leave();
					setTimeout(leave, argv.wait);
				});

				process.on('SIGINT', function() {
					process.exit();
				});
			});
		};

		var listen = net.Server.prototype.listen;
		net.Server.prototype.listen = function(p) {
			if (Number(p) === Number(port)) this.once('listening', join);
			listen.apply(this, arguments);
		};

		require(path.join(process.cwd(), main));
	};

	if (argv.port) return onport(parseInt(argv.port));

	freeport(function(err, port) {
		if (err) return error(err);
		onport(port);
	});
};

var onservice = function(service) {
	var name = service.name;
	delete service.name
	console.log(tree({
		label: name,
		leaf: service
	}));
};

cmds.list = function() {
	services.list(function(err, list) {
		if (err) return error(err);
		if (!list.length) return console.log(chalk.grey('(empty)'));
		list.forEach(function(service) {
			if (argv.verbose) return onservice(service);
			console.log(chalk.yellow(service.name));
		});
	});
};

cmds.lookup = function(name) {
	if (!name) return usage('lookup [name]');
	services.lookup(name, function(err, service) {
		if (err) return error(err);
		if (!service) return console.log(chalk.grey('(empty)'));
		onservice(service);
	});
};

(cmds[_[0]] || help).apply(null, _.slice(1));
