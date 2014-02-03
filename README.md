# etcd-registry

Service registry for Node.js on top of [etcd](https://github.com/coreos/etcd)

	npm install etcd-registry

## Usage

``` js
var registry = require('etcd-registry');

// Pass the nodes in your cluster in a connection string
var services = registry('127.0.0.1:4001,127.0.0.1:4002,127.0.0.1:4003');

// Join the registry
services.join('my-service-name', {port:8080});

// Wait a bit and do a lookup
services.lookup('my-service-name', function(err, service) {
	console.log('Found the following service:');
	console.log(service);
});

```

Running the above [example](https://github.com/mafintosh/etcd-registry/blob/master/example.js) will produce the following output

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

* `services = registry(connection-string)` Create a new registry client
* `services.join(name, service, [cb])` Join the registry with a new service
* `services.leave([name], [cb])` Leave the registry. Omit the name to remove local services
* `services.lookup(name, cb)` Lookup a single service
* `services.list([name], cb)` List all services as an array. Omit the name to list all services

## Connection string

The connection has the following format

	protocol://host1,host2,host3,.../namespace

The protocol can be `https` or `http` and defaults to `http`.
If you set a `namespace` all keys will be prefixed with the value.
If you do not specify a port in the hosts `4001` will be used (default etcd port).

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
If possible you should call `services.leave()` before exiting your service process. Otherwise your service will be garbage collected after (at most) 10s

## Service hierarchies

Use `/` in your service name to build service hierachies.
For example if you add a service under `public/my-service` you will be able to list all `public` services by doing

``` js
services.list('public', function(err, list) {
	// list is an array of all services called public or starting with public/
});
```

## Fault tolerance

If a operation fails `etcd-registry` will try another node in the cluster until it has tried everyone.
Every 60s `etcd-registry` will ping your cluster to see if new machines has joined and update the connection string

## License

MIT
