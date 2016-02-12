var Manager = require('./manager.js');
var pkg = require("../package.json");
var http = require("http");

var ProviderEngine = require("web3-provider-engine");
var FilterSubprovider = require('web3-provider-engine/subproviders/filters.js');
var Subprovider = require('web3-provider-engine/subproviders/subprovider.js');

Server = {
  server: function(logger, options) {
    if (logger == null) {
      logger = console;
    }

    var provider = this.provider(logger, options);
    var server = http.createServer(function(request, response) {

      var headers = request.headers;
      var method = request.method;
      var url = request.url;
      var body = [];

      request.on('error', function(err) {
        // console.error(err);
      }).on('data', function(chunk) {
        body.push(chunk);
      }).on('end', function() {
        body = Buffer.concat(body).toString();
        // At this point, we have the headers, method, url and body, and can now
        // do whatever we need to in order to respond to this request.

        switch (method) {
          case "OPTIONS":
            response.writeHead(200, {'Access-Control-Allow-Origin': '*', "Content-Type": "text/plain"});
            response.end("");
            break;
          case "POST":
            //console.log("Request coming in:", body);

            var payload;
            try {
              payload = JSON.parse(body);
            } catch(e) {
              response.writeHead(400, {"Content-Type": "text/plain"});
              response.end("400 Bad Request");
              return;
            }

            // Log messages that come into the TestRPC via http
            if (payload instanceof Array) {
              // Batch request
              for (var i = 0; i < payload.length; i++) {
                var item = payload[i];
                logger.log(item.method);
              }
            } else {
              logger.log(payload.method);
            }

            provider.sendAsync(payload, function(err, result) {
              if (err != null) {
                response.writeHead(500, {"Content-Type": "text/plain"});
                response.end(err.stack);
              } else {
                response.writeHead(200, {"Content-Type": "application/json"});
                response.end(JSON.stringify(result));
              }
            });

            break;
          default:
            response.writeHead(400, {"Content-Type": "text/plain"});
            response.end("400 Bad Request");
            break;
        }
      });
    });

    server.provider = provider;

    // // TODO: the reviver option is a hack to allow batches to work with jayson
    // // it become unecessary after the fix of this bug https://github.com/ethereum/web3.js/issues/345
    // var server = jayson.server(functions, {
    //   reviver: function(key, val) {
    //     if (typeof val === 'object' && val.hasOwnProperty('method') &&
    //         val.method === 'eth_call' && val.hasOwnProperty('params') &&
    //         val.params.constructor === Array && val.params.length === 1)
    //       val.params.push('latest');
    //     return val;
    //   }
    // });

    return server;
  },

  // TODO: Make this class-like to allow for multiple providers?
  provider: function(logger, options) {
    var self = this;

    if (logger == null) {
      logger = {
        log: function() {}
      };
    }

    var engine = new ProviderEngine();

    var manager = new Manager(logger, options);
    manager.initialize();

    engine.manager = manager;
    engine.addProvider(new FilterSubprovider());
    engine.addProvider(manager);
    engine.setMaxListeners(100);
    engine.start();

    return engine;
  },

  startServer: function(logger, options, callback) {
    var self = this;
    var port = options.port;

    if (port == null) {
      port = 8545;
    }

    if (logger == null) {
      logger = console;
    }

    var server = this.server(logger, options);

    logger.log("EthereumJS TestRPC v" + pkg.version);

    server.provider.manager.waitForInitialization(function(err, accounts) {
      server.listen(port, function() {
        logger.log("");
        logger.log("Available Accounts");
        logger.log("==================");

        accounts = Object.keys(accounts);

        for (var i = 0; i < accounts.length; i++) {
          logger.log(accounts[i]);
        }

        logger.log("");
        logger.log("Listening on localhost:" + port);

        if (callback) {
          callback();
        }
      });
    });
  }
}

module.exports = Server;