
const path = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const postcssNormalize = require('postcss-normalize');
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;
const getStyleLoaders = ( cssOptions, preProcessor ) => {
	const loaders = [
		{ loader: MiniCssExtractPlugin.loader },
		{
			loader: require.resolve('css-loader'),
			options: cssOptions,
		},
		{
			loader: require.resolve('postcss-loader'),
			options: {
				postcssOptions: {
          plugins: [ 'postcss-preset-env' ]
        },
				sourceMap: false
			}
		}
	].filter(Boolean)

	if( preProcessor ){
		loaders.push({
			loader: require.resolve( preProcessor ),
			options: { sourceMap: false }
		})
	}
	return loaders
}

module.exports = {
  options: {
    verbose: false,
    buildType: 'iso',
    cssPrefix: 'static/css',
    jsPrefix: 'static/js',
    mediaPrefix: 'static/media'
  },
  modifyWebpackOptions( opts ){
    const options = opts.options.webpackOptions
    // Add .marko to exlude
    options.fileLoaderExclude = [ /\.marko$/, ...options.fileLoaderExclude ]
    
    return options
  },
  modifyWebpackConfig({ webpackConfig }){
    
    webpackConfig.resolve.extensions = [ ...webpackConfig.resolve.extensions, '.css', '.scss', '.marko' ]
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      // .sandbox
      'themes': path.resolve(__dirname, 'src/views/themes'),
      'plugins': path.resolve(__dirname, 'plugins'),

      // Service root
      'test': path.resolve(__dirname, '../test'),
      'root': path.resolve(__dirname, '../src'),
      ['~']: path.resolve(__dirname, 'src/views/assets'),
    }
    webpackConfig.resolve.fallback = { 
      ...webpackConfig.resolve.fallback,
      assert: require.resolve('assert'),
      stream: require.resolve('stream-browserify'),
      crypto: require.resolve('crypto-browserify')
    }

    webpackConfig.plugins.push(new MiniCssExtractPlugin())
    
    webpackConfig.module.rules.push({
      test: /\.marko$/,
      loader: require.resolve('@marko/webpack/loader')
    })
    
    webpackConfig.module.rules.push({
				test: sassRegex,
				exclude: sassModuleRegex,
				use: getStyleLoaders({ importLoaders: 2, sourceMap: false }, 'sass-loader' ),
				sideEffects: true,
			},
			{
				test: sassModuleRegex,
				use: getStyleLoaders({ importLoaders: 2, sourceMap: false, modules: true, getLocalIdent: getCSSModuleLocalIdent }, 'sass-loader' )
			}
		)

    return webpackConfig
  }
}