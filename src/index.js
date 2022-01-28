
import express from 'express'
import compressionMiddleware from 'compression'
import markoMiddleware from '@marko/express'
import www from './www.marko'

const 
port = parseInt( 33000, 10 ),
app = express()
.use( compressionMiddleware() ) // Enable gzip compression for all HTTP responses.
.use( '/assets', express.static('dist/assets') ) // Serve assets generated from webpack.
.use( markoMiddleware() ) // Enables res.marko.

/*-------------------------------------------------------------------*/
// Application Assets Manifest
const Assets = require( process.env.RAZZLE_ASSETS_MANIFEST )
app.use( express.static( process.env.RAZZLE_PUBLIC_DIR ) )

/*-------------------------------------------------------------------*/
.get( '/', ( req, res ) => res.marko( www, { title: 'SandBox', Assets } ) )
.listen( port, error => {
  if( error ) throw error
  if( port ) console.log(`Sandbox: [localhost] \t\t Port: [${port}]`)
} )
