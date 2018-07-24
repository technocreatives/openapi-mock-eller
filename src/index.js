const express = require('express')
const router = require("express-promise-router")
const _ = require("lodash")
const fs = require("fs")
const path = require("path")
const jref = require("json-ref-lite")
const yaml = require("js-yaml")
const winston = require("winston")
const faker = require("faker")
const jsf = require("json-schema-faker")

jsf.format("byte", () => new Buffer(faker.lorem.sentence(12)).toString("base64"))

jsf.option({
  alwaysFakeOptionals: true
})

const ajv = require("ajv")({
  unknownFormats: "ignore"
})

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'combined.log' })
  ]
})

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    level: "debug"
  }))
}

function loadYamlFile(fn) {
  let tree = yaml.safeLoad(fs.readFileSync(fn, "utf8"))

  // Add keys to schemas
  if (tree.components && tree.components.schemas) {
    Object.keys(tree.components.schemas).forEach(k => {
      tree.components.schemas[k].key = k
    })
  }

  // Add parameters to methods
  _.forEach(tree.paths, (o, routePath) => {
    const params = o.parameters || []
    
    _.forEach(o, (defn, httpMethod) => {
      if (httpMethod === "parameters") {
        return
      }

      defn.parameters = params.concat(defn.parameters || [])
    })
  })

  // Resolve $refs
  tree = jref.resolve(tree)

  // Merge all "allOf"
  if (tree.components && tree.components.schemas) {
    Object.keys(tree.components.schemas).forEach(k => {
      const schema = tree.components.schemas[k]

      if (schema.properties) {
        Object.keys(schema.properties).forEach(k => {
          const prop = schema.properties[k]

          if (prop.allOf) {
            schema.properties[k] = Object.assign({}, ...prop.allOf)
          }
        })
      }
    })
  }

  // Validate all endpoint schemas
  if (tree.paths) {
    _.forEach(tree.paths, (methodMap, routePath) => {
      _.forEach(methodMap, (operation, method) => {
        if (method == "parameters" || method.startsWith("x-")) {
          return
        }

        const reqSchema = findRequestSchema(operation.requestBody)
        if (reqSchema) {
          operation.validateRequest = ajv.compile(reqSchema)
        }

        const resSchema = findResponseSchema(operation.responses)
        if (resSchema) {
          operation.validateResponse = ajv.compile(resSchema)
        }
      })
    })
  }

  return tree
}

const findResponseSchema = (r) => {
  const { content } = _.find(r, (v, k) => k >= 200 && k <= 299)
  if (content == null) {
    return null
  }
  // Get first object by key.
  return _.find(content).schema
}

const findRequestSchema = (r) => {
  const { content } = r || {}
  if (content == null) {
    return null
  }
  return _.find(content).schema
}

function generateMockOperation(method, name, data) {
  const responseSchema = findResponseSchema(data.responses)
  // const requestSchema = findRequestSchema(data.requestBody)

  // logger.debug(JSON.stringify(requestSchema))
  const mockName = `${name}Mock`

  // This ensures that stacktraces have the named function if it fails.
  const holder = {
    async [mockName](req, res) {
      if (data.validateRequest && !data.validateRequest(req.body)) {
        return res.json({
          error: {
            message: "Request failed to validate",
            meta: data.validateRequest.errors
          }
        })
      }
  
      if (responseSchema == null) {
        return res.json({})
      }
      
      const fakedResponse = await jsf.resolve(responseSchema)
  
      return res.json(fakedResponse)
    }
  }
  
  return holder[mockName]
}

class OpenApiServer {
  constructor(schemaPath, operations = {}, options = {}) {
    this.schema = loadYamlFile(schemaPath)
    this.operations = operations
    this.options = options

    this.app = express()
    this.router = router()

    this.app.use(require("body-parser").json())
    this.app.use(require("body-parser").urlencoded({extended: true}))
    // TODO: this shit just doesn't work
    // this.app.use(require("express-formidable")())
    this.app.use("/", this.router)
    
    this.app.get('/docs/schema.json', (req, res) => res.json(this.schema))
    this.app.get(['/docs/', '/docs/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'docs.html')))
    this.app.get('/docs/*', (req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'swagger-ui-dist', req.params[0])))

    this.app.use("/", (req, res) => {
      logger.info(`[404] ${req.originalUrl}`)
      return res
        .status(404)
        .json({
          error: {
            message: "Not found",
          }
        })
    })

    this.app.use((err, req, res, next) => {
      logger.error(`[500] ${err}`)
      return res
        .status(err.status || 500)
        .json({
          error: {
            message: err.message,
            stack: err.stack,
          }
        })
    })

    // Import the routes
    for (const path in this.schema.paths) {
      const pathValue = this.schema.paths[path]

      // logger.debug(`Registering path: ${path}`)

      const expressPath = path.replace(/{/g, ":").replace(/}/g, "")
      for (const httpMethod in pathValue) {
        if (httpMethod === "parameters" || httpMethod.startsWith("x-")) {
          continue
        }

        const operation = pathValue[httpMethod]
        const id = operation.operationId || operation.summary

        logger.info(`${httpMethod.toUpperCase()} ${expressPath} (${id})`)

        // Mock it all!
        const expressOperation = generateMockOperation(httpMethod, id, operation)
        this.operations[id] = expressOperation

        this.router[httpMethod](expressPath, this.operations[id])
      }
    }
  }
}

module.exports = OpenApiServer
