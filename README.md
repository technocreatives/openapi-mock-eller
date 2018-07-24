# OpenAPI v3 Mock Server

A very alpha server for generating mock data from an OpenAPI v3 spec.

The codebase is very small, contributions are very welcome. :smile:

## Usage

No npm module yet, sorry. You can clone this repo though and execute it from wherever you like:

```
node server.js <spec.yaml> [--port=8001] [--host=localhost]
```

Your server is now running on <http://localhost:8001>.
You can find the rendered documentation for your spec at <http://localhost:8001/docs>,
and, if you ever need it, the JSON source of your spec at <http://localhost:8001/docs/schema.json>.

## License

ISC license - see LICENSE file.
