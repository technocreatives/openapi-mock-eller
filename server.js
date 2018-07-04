const argv = require('minimist')(process.argv.slice(2), {
    alias: {
      p: 'port',
      h: 'host',
      h: 'help',
    },
    default: {
      port: 8001,
      host: 'localhost',
    }
  });

const yamlFile = argv._[0]
if (!yamlFile) {
    console.error("Usage: server.js <yaml>")
    process.exit(1)
}

const thingo = new (require("./src"))(yamlFile)
thingo.app.listen(argv.port, argv.host, function() {
    console.log(`Listening on http://${argv.host}:${argv.port}`)
})
