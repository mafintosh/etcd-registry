var test = require('tap').test;
var registry = require('./');

var reg = registry('127.0.0.1:4001');

test('adding a service', function(test) {
	test.plan(4);
	reg.join('test', {port:1000, hostname:'127.0.0.1'}, function(err) {
		test.ok(!err, 'no error on join');
		setTimeout(function() {
			reg.lookup('test', function(err, s) {
				test.ok(!err, 'no error on lookup');
				test.ok(!!s, 'service exists');
				test.deepEqual(s, {
					name: 'test',
					port:1000,
					hostname: '127.0.0.1',
					host: '127.0.0.1:1000',
					url: 'http://127.0.0.1:1000'
				}, 'valid service');
				reg.leave(function() {
					test.end();
				});
			});
		}, 100);
	});
});

test('listing services', function(test) {
	test.plan(4);
	reg.join('test', {port:1000}, function(err) {
		test.ok(!err, 'no error on join');
		reg.join('test', {port:1001}, function(err) {
			test.ok(!err, 'no error on join');
			setTimeout(function() {
				reg.list('test', function(err, list) {
					test.ok(!err, 'no error on list');
					test.equal(list.length, 2, '2 services exists');
					reg.leave(function() {
						test.end();
					});
				});
			}, 100);
		});
	});
});

test('removing services', function(test) {
	test.plan(4);
	reg.join('test', {port:1000}, function(err) {
		test.ok(!err, 'no error on join');
		reg.leave('test', function(err) {
			test.ok(!err, 'no error on join');
			setTimeout(function() {
				reg.lookup('test', function(err, s) {
					test.ok(!err, 'no error on lookup');
					test.ok(!s, 'all services removed');
					reg.leave(function() {
						test.end();
					});
				});
			}, 100);
		});
	});
});
