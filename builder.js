Browserify = Npm.require('browserify');
envify = Npm.require('envify/custom');
exorcist = Npm.require('exorcist');
stream = Npm.require('stream');
stripJsonComments = Npm.require('strip-json-comments');
npm = Npm.require('npm');
os = Npm.require('os');
camelCase = Npm.require('camelcase');
fs = Plugin.fs;
path = Plugin.path;

class UniverseModulesNPMBuilder extends MultiFileCachingCompiler {
    constructor() {
        super({
            compilerName    : 'UniverseModulesNPMBuilder',
            defaultCacheSize: 1024 * 1024 * 10
        });
    }

    getCacheKey(file) {
        return [
            file.getSourceHash(),
            file.getDeclaredExports(),
            file.getFileOptions()
        ]
    }

    compileResultSize (compileResult) {
        return compileResult.source.length + ((compileResult.sourceMap && compileResult.sourceMap.length) || 0);
    }

    getBasedir(file) {
        let basedir = Plugin.convertToStandardPath(path.join(os.tmpdir(), 'universe-npm'));
        return Plugin.convertToOSPath(basedir + '/' + (file.getPackageName()||'' + file.getPathInPackage()).replace(/[^a-zA-Z0-9\-]/, '_'));
    }

    addCompileResult(file, compileResult) {
        return file.addJavaScript({
            path      : file.getPathInPackage() + '.js',
            sourcePath: file.getPathInPackage(),
            data      : compileResult.source,
            sourceMap : compileResult.sourceMap
        });
    }

    getRoot(altPackageName) {
        var index, root;
        root = this.getPackageName();
        if (root != null) {
            index = root.indexOf(':') + 1;
            root = 'packages/' + root.slice(index);
        } else if (altPackageName != null) {
            root = 'packages/' + altPackageName;
        } else {
            root = '';
        }
        return root;
    }

    compileOneFile(file, files) {
        var browserify, bundle, compileResult, e;
        file.getRoot = this.getRoot.bind(file);
        try {
            const {source, config} = this.prepareSource(file);
            const optionsForBrowserify = this.getBrowserifyOptions(file, config.browserify || {});
            browserify = Browserify([source], optionsForBrowserify);
            this.applyTransforms(browserify, optionsForBrowserify);
            bundle = this.getBundle(browserify, file);
            compileResult = this.getCompileResult(bundle);
            return {
                compileResult        : compileResult,
                referencedImportPaths: []
            };
        } catch (_error) {
            e = _error;
            file.error({
                message: e.message
            });
        }
    }

    applyTransforms(browserify, browserifyOptions) {
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

    getBundle(browserify, file) {
        var bundle, exorcisedBundle, mapFilePath;
        bundle = browserify.bundle();
        bundle.setEncoding('utf8');
        mapFilePath = Plugin.convertToOSPath(path.resolve(file.getRoot(), file.getPathInPackage() + '.map'));
        exorcisedBundle = bundle.pipe(exorcist(mapFilePath, file.getDisplayPath()));
        exorcisedBundle.originalBundle = bundle;
        exorcisedBundle.mapFilePath = mapFilePath;
        return exorcisedBundle;
    }

    getCompileResult(bundle) {
        var result, sourceMap;
        result = {
            source: getString(bundle)
        };
        sourceMap = fs.readFileSync(bundle.mapFilePath, {
            encoding: 'utf8'
        });
        fs.unlinkSync(bundle.mapFilePath);
        result.sourceMap = sourceMap;
        return result;
    }

    getBrowserifyOptions(file, userOptions = {}) {
        let defaultOptions, transform;
        let transforms = {
            envify: {
                NODE_ENV: this.getDebug() ? 'development' : 'production',
                _       : 'purge'
            }
        };
        defaultOptions = {
            basedir: this.getBasedir(file),
            debug  : true,
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

    getDebug() {
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

    prepareSource(file) {
        const source = new stream.PassThrough();
        const config = JSON.parse(stripJsonComments(file.getContentsAsString()));
        const moduleId = this.getModuleId(file);
        let lines = '', standalone = '';
        const prepareRegister = (modId, exp) => 'System.register("' + modId + '", [],function(_export){' +
        'return {setters: [],execute:function(){' + exp + '}};});';

        if (config && config.dependencies) {
            _.each(config.dependencies, function (version, packageName) {
                lines += '_export("' + camelCase(packageName) + '", require("' + packageName + '"));';
                standalone += prepareRegister(
                    moduleId + '/' + packageName,
                    '_export("default", require("' + packageName + '"));'
                );
            });
            installPackages(this.getBasedir(file), file, config.dependencies);
        }

        var result = prepareRegister(moduleId, lines) + standalone;
        source.end(result);
        return {source, config};
    }

    getModuleId(file) {
        // Relative path of file to the package or app root directory (always uses forward slashes)
        const filePath = file.getPathInPackage();

        // Options from api.addFile
        const fileOptions = file.getFileOptions();

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
                message   : 'Couldn\'t read JSON data: ' + err.toString(),
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });
            return;
        }
        npm.commands.install(basedir, packages, cb);
    });
});

var getString = Meteor.wrapAsync(function (bundle, cb) {
    var string;
    string = '';
    bundle.on('data', function (data) {
        return string += data;
    });
    bundle.once('end', function () {
        return cb(void 0, string);
    });
    return bundle.originalBundle.once('error', function (error) {
        return cb(error);
    });
});

Plugin.registerCompiler({
    extensions: ['npm.json']
}, function () {
    return new UniverseModulesNPMBuilder();
});

