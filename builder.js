Browserify = Npm.require('browserify');
envify = Npm.require('envify/custom');
exorcistStream = Npm.require('exorcist-stream');
strung = Npm.require('strung');
stream = Npm.require('stream');
stripJsonComments = Npm.require('strip-json-comments');
npm = Npm.require('npm');
os = Npm.require('os');
camelCase = Npm.require('camelcase');
fs = Plugin.fs;
path = Plugin.path;

class UniverseModulesNPMBuilder extends CachingCompiler {
    constructor () {
        super({
            compilerName: 'UniverseModulesNPMBuilder',
            defaultCacheSize: 1024 * 1024 * 10
        });
    }

    getCacheKey (file) {
        return [
            file.getSourceHash(),
            file.getDeclaredExports(),
            file.getPathInPackage(),
            file.getFileOptions()
        ]
    }

    compileResultSize ({compileResult}) {
        return compileResult.source.length + ((compileResult.sourceMap && compileResult.sourceMap.length) || 0);
    }

    getBasedir (file) {
        let basedir = Plugin.convertToStandardPath(path.join(os.tmpdir(), 'universe-npm'));
        return Plugin.convertToOSPath(basedir + '/' + (file.getPackageName() || '' + file.getPathInPackage()).replace(/[^a-zA-Z0-9\-]/, '_'));
    }

    addCompileResult (file, {compileResult}) {
        return file.addJavaScript({
            path: file.getPathInPackage() + '.js',
            sourcePath: file.getPathInPackage(),
            data: compileResult.source,
            sourceMap: compileResult.sourceMap
        });
    }

    compileOneFile (file) {
        var browserify, bundle, compileResult, e;
        try {
            const {source, config} = this.prepareSource(file);
            const optionsForBrowserify = this.getBrowserifyOptions(file, config.browserify || {});
            browserify = Browserify([source], optionsForBrowserify);
            this.applyTransforms(browserify, optionsForBrowserify);
            bundle = this.getBundle(browserify, file);
            compileResult = this.getCompileResult(bundle);
            return {
                compileResult: compileResult,
                referencedImportPaths: []
            };
        } catch (_error) {
            e = _error;
            file.error({
                message: e.message
            });
        }
    }

    applyTransforms (browserify, browserifyOptions) {
        var envifyOptions, transformName, transformOptions, transforms;
        envifyOptions = browserifyOptions.transforms.envify;
        delete browserifyOptions.transforms.envify;
        transforms = browserifyOptions.transforms;
        for (transformName in transforms) {
            if (!_.has(transforms, transformName)) continue;
            transformOptions = transforms[transformName];
            browserify.transform(transformName, transformOptions);
        }
        browserify.transform(envify(envifyOptions));
    }

    getBundle (browserify, file) {
        browserify.ignore('react');
        var bundle = browserify.bundle();
        bundle.setEncoding('utf8');
        var sourceMapStream = strung();
        var exorcisedBundle = bundle.pipe(exorcistStream(sourceMapStream, file.getDisplayPath()));
        exorcisedBundle.originalBundle = bundle;
        exorcisedBundle.sourceMapStream = sourceMapStream;
        return exorcisedBundle;
    }

    getCompileResult (bundle) {
        return ({
            source: getString(bundle),
            sourceMap: bundle.sourceMapStream.string
        });
    }

    getBrowserifyOptions (file, userOptions = {}) {
        let defaultOptions, transform;
        let transforms = {
            envify: {
                NODE_ENV: this.getDebug() ? 'development' : 'production',
                _: 'purge'
            }
        };
        defaultOptions = {
            basedir: this.getBasedir(file),
            debug: true,
            transforms
        };
        _.defaults(userOptions, defaultOptions);
        if ((transform = userOptions.transforms) != null) {
            if (transform.envify == null) {
                transform.envify = defaultOptions.transforms.envify;
            }
        }
        return userOptions;
    }

    getDebug () {
        var debug, key, _i, _len, _ref1;
        debug = true;
        _ref1 = process.argv;
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            key = _ref1[_i];
            if (key === 'bundle' || key === 'build') {
                debug = __indexOf.call(process.argv, '--debug') >= 0;
                break;
            }
        }
        return debug;
    }

    prepareSource (file) {
        const source = new stream.PassThrough();
        const config = JSON.parse(stripJsonComments(file.getContentsAsString()));
        const moduleId = this.getModuleId(file);
        let lines = '', standalone = '';
        const prepareRegister = (modId, exp) => {
            return `System.registerDynamic("${modId}", [], true, function(_require, _exports, _module) {${exp}});`;
        };

        if (config && config.dependencies) {
            _.each(config.dependencies, function (version, packageName) {
                lines += `_exports.${camelCase(packageName)} = require('${packageName}');`;
                standalone += prepareRegister(
                    moduleId + '/' + packageName,
                    `_module.exports = require('${packageName}');`
                );
            });
            installPackages(this.getBasedir(file), file, config.dependencies);
        }

        var result = prepareRegister(moduleId, lines) + standalone;
        source.end(result);
        return {source, config};
    }

    getModuleId (file) {
        // Relative path of file to the package or app root directory (always uses forward slashes)
        const filePath = file.getPathInPackage();

        // Options from api.addFile
        //const fileOptions = file.getFileOptions();

        // Name of the package or null if the file is not in a package.
        const packageName = file.getPackageName();

        // moduleId - Module name (full patch without extension)
        // ext - File extension (either js or jsx)
        let moduleId = filePath.replace(/\.npm\.json$/, '');

        // prefix module name accordingly
        if (packageName) {
            // inside package
            moduleId = '/_modules_/packages/' + packageName.replace(':', '/') + '/' + moduleId;
        } else {
            // inside main app
            moduleId = '/_modules_/app/' + moduleId;
        }
        return moduleId;
    }


}

var installPackages = Meteor.wrapAsync(function (basedir, file, packageList, cb) {


    var packages = _.chain(packageList).map(function (version, packageName) {
        if (fs.existsSync(basedir + '/node_modules/' + packageName)) {
            return;
        }
        if (typeof version === 'object') {
            version = version.version;
        }
        if (!version) {
            throw new EvalError('Missing version of npm package: ' + packageName);
        }
        return packageName + '@' + version;
    }).compact().value();

    if (!packages || !packages.length) {
        return cb();
    }
    npm.load(function (err) {
        if (err) {
            file.error({
                message: 'Couldn\'t read JSON data: ' + err.toString(),
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });
            return;
        }
        npm.commands.install(basedir, packages, cb);
    });
});

var getString =  Meteor.wrapAsync(function(bundle, cb) {
    var source;
    source = strung();
    source.on('finish', function() {
        return cb(void 0, source.string);
    });
    source.on('error', cb);
    bundle.originalBundle.once('error', cb);
    bundle.sourceMapStream.once('error', cb);
    bundle.once('error', cb);
    return bundle.pipe(source);
});

Plugin.registerCompiler({
    extensions: ['npm.json']
}, function () {
    return new UniverseModulesNPMBuilder();
});

