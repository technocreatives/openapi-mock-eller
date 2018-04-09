const [yamlFile] = process.argv.slice(2)

if (!yamlFile) {
    console.error("Usage: server.js <yaml>")
    process.exit(1)
}

const thingo = new (require("./src"))(yamlFile)
thingo.app.listen(8001, function() {
    console.log("Listening on http://127.0.0.1:8001")
})