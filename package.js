Package.describe({
    name: 'universe:modules-npm',
    version: '0.5.5',
    // Brief, one-line summary of the package.
    summary: 'Import of npm packages that works on client and server',
    // URL to the Git repository containing the source code for this package.
    git: 'https://github.com/vazco/meteor-universe-modules-npm',
    // By default, Meteor will default to using README.md for documentation.
    // To avoid submitting documentation, set this field to null.
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'UniverseModulesNPMBuilder',
    use: ['meteor', 'underscore@1.0.3'],
    sources: ['build-plugin.js'],
    npmDependencies: {
        'browserify': '10.2.6',
        'envify': '3.4.0',
        'exorcist': '0.4.0',
        'json-comments': '0.2.1',
        'exposify': '0.4.3',
        'camelcase': '1.2.1',
        'npm': '2.14.2'
    }
});

Package.onUse(function (api) {
    api.versionsFrom('1.1.0.3');
    api.use([
        'universe:modules@0.4.2'
    ]);
});
