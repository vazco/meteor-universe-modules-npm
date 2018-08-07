<h1 align="center">
    <a href="https://github.com/vazco">vazco</a>/Universe Modules NPM
</h1>

&nbsp;

<h3 align="center">
  -- Abandonware. This package is deprecated! --
</h3>

&nbsp;

# Universe Modules NPM
Extension for package universe:modules that adds possibility of bundling npm packages into universe modules. Works on both sides (client/server). Provides mappings of dependencies npm <-> universe:modules without keeping of duplicates in npm bundle.

And you can use it, just like that:
```
import cn from '{username:mypackage}/packages/classnames';
```

### How It works

#### In Meteor Package
1. Create file <name>.npm.json, like myPacks.npm.json and add it to package.js by api.addFiles
2. In package.js add dependency `universe:modules-npm`
3. Add some packages under key **packages** (as a name:version pairs) to file `myPacks.npm.json`:

```
{
  "packages": {
      "classnames": "2.1.3",
      "react-widgets": "2.8.2",
      // You can even attach comments here
      "typographic-numbers": "0.2.1"
  }
}
```

4. You can import already added packages.

```
import classNames from '{username:mypackage}/myPacks/classnames';
import typographicNumbers from '{username:mypackage}/myPacks/typographic-numbers';
import {globalizeDateLocalizer} from '{username:mypackage}/myPacks/react-widgets/lib/globalize-localizers';

// All packages from file
import {typographicNumbers, classnames} from '{username:mypackage}/myPacks';
// names of packages are converted to camelcase variable name
```

#### In app
You can use It outside of package too.
To do that please create and add in application space file `myfile.npm.json`.
And now, you can import something like this: `import classNames from 'myfile/classnames'`

### Options

#### Replacing requirements of npm modules to system js modules

```
{
  "packages":{
    "classnames": "2.1.3",
    "rc-tabs": "5.5.0"
  },
  "system": {
    // In bundle "react" will be replaced by universe:modules dependency.
    "dependencies": ["react", "react-dom"]
  }
}
```

In example we can see how to change source of module for `require('react')` from NPM dependencies
on to System Js `System.import('react')`. All call to 'react/*' by require() will be redirected to System.import()

**Tip:** Package universe:utilities-react from version 0.5.1 provides react from meteor package under system module "react" with dependencies "react/*" like "react/addons" .
It means that if you want use some npm package (that need "react/addons", "react/lib/*" ...)
Instead of manually register of modules for systemjs,
you can use our package `universe:utilities-react` to provide react modules.

#### Importing files inside npm package

lets assume we have added package  ` "react-widgets": "2.8.2", ` in file `myPacks.npm.json`

And path to interesting Us file inside npm package is: `./lib/globalize-localizers.js`

Our import in es6 will be looks like:
```
import {globalizeDateLocalizer} from '/myPacks/react-widgets/lib/globalize-localizers';
```

There is possible only if file is required, but if in package are optional files to import (or others entry)
We can pass to `*.npm.json` other files that should be bundled.
Key  `entries` is for that situations.

e.g.:
```
{ //some.npm.json
    "packages": {
        "globalize": "0.1.1"
    },
    "entries": [
        "globalize/lib/cultures/globalize.culture.pl-PL.js"
    ]
}

```

importing in es6:
```
import from '/some/globalize/lib/cultures/globalize.culture.pl-PL'   
```

#### browserify
This package uses browserify for bundling.
You can pass options in the same file under key **browserify** to make changes on this process

```
{
  "packages": {
     "jedify": "1.0.0"
  },
  "browserify": {
      "transforms": {
        "jedify": { lang: 'nb_NO' }
      }
  }
}
```

### License

This package is part of [Universe](http://unicms.io), a package ecosystem based on [Meteor platform](http://meteor.com) maintained by [Vazco](http://www.vazco.eu).
It works as standalone Meteor package, but you can get much more features when using the whole system.   

<img src="https://vazco.eu/banner.png" align="right">

**Like every package maintained by [Vazco](https://vazco.eu/), Universe Modules NPM is [MIT licensed](https://github.com/vazco/uniforms/blob/master/LICENSE).**
