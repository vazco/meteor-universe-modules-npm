__UniverseNPMDynamicLoader = function(moduleId, deps, sysCfg, fn, indexes){
    System.registerDynamic(moduleId, deps, true, fn);
    const loaderName = 'UniverseDynamicLoader_' + camelCase(moduleId.replace(/[:\/\\]/g, '_'));
    const pathAll = moduleId + '/*';
    System.config({
        meta: {
            [pathAll]: {
                format: 'register',
                loader: loaderName
            }
        }
    });
    if (typeof sysCfg === 'object' && Object.keys(sysCfg).length) {
        System.config(sysCfg);
    }
    // Register our loader
    System.set(loaderName, System.newModule({
        locate: function locate(params) {
            var name = params.name;
            var metadata = params.metadata;
            return new Promise(function(resolve, reject) {
                var names = name.split(moduleId+'/');
                metadata.submoduleName = names[1];
                // check if we're in valid namespace
                if (names[0] || !metadata.submoduleName) {
                    reject(new Error('[Universe Modules NPM]: trying to get exported values from invalid package: ' + name));
                    return;
                }
                resolve(name);
            });
        },
        fetch: function fetch () {
            // we don't need to fetch anything for this to work
            return '';
        },
        instantiate: function instantiate (params) {
            var metadata = params.metadata;
            return System.import(moduleId).then(function({_bundleRequire}) {
                return _bundleRequire(indexes[metadata.submoduleName] || metadata.submoduleName);
            });
        }
    }));
};

var camelCase = function () {
    var str = [].map.call(arguments, function (str) {
        return str.trim();
    }).filter(function (str) {
        return str.length;
    }).join('-');

    if (!str.length) {
        return '';
    }

    if (str.length === 1) {
        return str;
    }

    if (!(/[_.\- ]+/).test(str)) {
        if (str === str.toUpperCase()) {
            return str.toLowerCase();
        }

        if (str[0] !== str[0].toLowerCase()) {
            return str[0].toLowerCase() + str.slice(1);
        }

        return str;
    }

    return str
        .replace(/^[_.\- ]+/, '')
        .toLowerCase()
        .replace(/[_.\- ]+(\w|$)/g, function (m, p1) {
            return p1.toUpperCase();
        });
};
