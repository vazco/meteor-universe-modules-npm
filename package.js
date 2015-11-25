var UNIVERSE_MODULES_VERSION = '0.6.4'; //eslint-disable-line no-var
Package.describe({
    name: 'universe:modules-npm',
    version: UNIVERSE_MODULES_VERSION, // or is this a bad idea?
    // Brief, one-line summary of the package.
    summary: 'Import NPM packages on client & server, mapping dependencies on system js modules (useful for React)',
    // URL to the Git repository containing the source code for this package.
    git: 'https://github.com/vazco/meteor-universe-modules-npm',
    // By default, Meteor will default to using README.md for documentation.
    // To avoid submitting documentation, set this field to null.
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'UniverseModulesNPMBuilder',
    use: [
        'meteor',
        'underscore@1.0.4',
        'ecmascript@0.1.6',
        'caching-compiler@1.0.0',
        'universe:modules@' + UNIVERSE_MODULES_VERSION
    ],
    sources: ['builder.js'],
    npmDependencies: {
        'browserify': '12.0.1',
        //'envify': '3.4.0', breaking my packages / let user specify it themselves if they want
        'strip-json-comments': '2.0.0',
        'camelcase': '2.0.1',
        'npm': '3.4.1'
    }
});

Package.onUse(function(api) {
    api.versionsFrom('1.2.0.2');
    api.use([
        'universe:modules@' + UNIVERSE_MODULES_VERSION,
        'isobuild:compiler-plugin@1.0.0',
        'ecmascript@0.1.6',
        'promise'
    ]);

    /**
     * wh wait, why? its not used anywhere in package --> should be in users own package
     *
     *  api.use([
     *   'universe:utilities-react@0.5.4',
     *   'react-runtime'
     * ], ['server', 'client'], {weak: true});
     **/

    api.addFiles('system/UniverseNPMDynamicLoader.js');
    api.export('__UniverseNPMDynamicLoader');
    // api.imply('promise'); no need to imply if we depend on it
});
