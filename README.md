# etcd-registry

Service registry for Node.js on top of [etcd](https://github.com/coreos/etcd)

	npm install etcd-registry

## Usage

``` js
var registry = require('etcd-registry');

// Pass the nodes in your cluster in a connection string
var reg = registry('127.0.0.1:4001,127.0.0.1:4002,127.0.0.1:4003');

// Join the registry and do a look
reg.join('my-service-name', {port:8080}, function(err) {
	reg.lookup('my-service-name', function(err, service) {
		console.log('Found the following service:');
		console.log(service);
	});
});
```

Running the above example will produce the following output

```
Found the following service:
{
	name: 'my-service-name',
	port: 8080,
	hostname: '192.168.1.10',
	host: '192.168.1.10:8080',
	url: 'http://192.168.1.10:8080'
}
```

## Full api

* `reg = registry(connection-string)` Create a new registry client
* `reg.join(name, service, [cb])` Join the registry with a new service
* `reg.leave([name], [cb])` Leave the registry. Omit the name to remove local services
* `reg.lookup(name, [cb])` Lookup a single service
* `reg.list(name, [cb])` List all services as an array

## Services

Services are just JSON documents. `etcd-registry` will add a default `hostname` and a couple of other properties.
An example of a service document could be:

``` js
{
	name: 'my-service',
	port: 8080,
	hostname: '192.168.1.10',       // added by etcd-registry
	host: '192.168.1.10:8080',      // added by etcd-registry
	url: 'http://192.168.1.10:8080' // added by etcd-registry
}
```

These documents are saved in [etcd](https://github.com/coreos/etcd) with a TTL of 10s.
Every 5s `etcd-registry` will send a heartbeat for each service to the registry which resets the expiration counter.
If possible you should call `reg.leave()` before exiting your service process. Otherwise your service will be garbage collected after (at most) 10s

## Fault tolerance

If a operation fails `etcd-registry` will try another node in the cluster until it has tried everyone.
Every 60s `etcd-registry` will ping your cluster to see if new machines has joined and update the connection string

## License

MIT