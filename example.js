var registry = require('./');

var client = registry('127.0.0.1:4001,127.0.0.1:4002,127.0.0.1:4003');

client.join('test', {
	port:8080,
	inserted:Date.now()
}, function() {
	setTimeout(function() {
		client.lookup('test', function(err, service) {
			console.log('error:', err);
			console.log('service:', service);
			client.leave();
		});
	}, 100);
});
