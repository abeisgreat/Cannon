//     Cannon.js 0.0.1
//     (c) 2014 Abraham Haskins
//     Cannon may be freely distributed under the MIT license.

// Our main Cannon class which takes the URL of the data we are looking to retreive and manipulate.

// For example `new Cannon("http://api.reddit.com/user/unidan/")`
var Cannon = function (url) {
    
    // Initial setup
    // --------------
    
    // The URL this Cannon loads data from.
    this.url = url;
    
    // The object containing reloader information
    this.reloaderStrs = {};
    
    // The default projectile is `"*"` i.e. all children of data
    this.projectileStr = "*";
    
    // All data loaded from URL and reloads, used for `Cannon.recoil`
    this.rawData = [];
    
    // The total HTTP requests made, used for `Cannon.limit`
    this.fetches = 0;
    
    // The delay (in milliseconds) between each HTTP request, used for `Cannon.delay`
    this.delayInt = 0;
    
    // Our definition of self.
    var self = this;
    
    // Exported Methods
    // --------------
    
    // The `Cannon.fire` method is used to activate the Cannon (i.e. make HTTP requests, parse data, etc). The data passed to the callback will be an array of data shaped by string passed to `Cannon.projectile`.
    this.fire = function (callback) {
        self._fetch(callback);
        return self;
    };
    
    // The `Cannon.reload` method is used for dealing with paginated content. It takes an object of reloader strings like `{after: "data.after"}` and stores it in the Cannon. After the initial URL provided to the Cannon is loaded, another URL will be loaded which has the added query data `?after={{data.after}}` with the value for `data.after` being pulled from the data for the first page. 
    this.reload = function (reloaderStrs) {
        self.reloaderStrs = reloaderStrs;
        return self;
    };
    
    // The `Cannon.limit` method is used for limiting the number of HTTP requests when a reloader is used. Theoredically, a reloader could be used to load an infinite amount of pages, which may not be what we want. The `limit` method takes a number and will not let the total page requests from this Cannon exceed that number.
    this.limit = function (limit) {
        self.limitInt = limit;
        return self;
    };
    
    // The `Cannon.delay` method is used for adding a delay between HTTP requests when a reloader is used. This method takes a number of millseconds and delays each HTTP request by that amount of time.
    this.delay = function (delayInt) {
        self.delayInt = delayInt;
        return self;
    };
    
    // The `Cannon.projectile` method is used for defining the shape of the data passed to `Cannon.fire`'s callback. An example `projectileStr` would be `"data.children.*.data.title"`. This tells the Cannon to fire the data in `dataFromURL['data']['children'][*]['data']['title']`. This syntax should be familiar to any developer with the exception of the special `*` field. This character is the single most important concept when building a Cannon. It acts as a wild card and allows us to get a list of titles from all the children, not just a specific one.
    this.projectile = function (projectileStr) {
        self.projectileStr = projectileStr;
        return self;
    };
    
    // The `Cannon.recoil` method is typically used from within the `Cannon.fire` callback. This method will take a single projectile and return the parent(s) of that projectile. For example, if we have our projectile set as `"data.children.*.data.title"`, then our projectile will be the value of `title`. In order to access the complete child's data, we can `Cannon.recoil` the `title` and we will receive the `data` object which has the `title` field. It is important to note that *this method returns a list of matches, not a single match* due to the fact that there is no guarantee that the projectile provided will be unique.
    this.recoil = function (projectile) {
        return self._getField(self.rawData, self.projectileStr, projectile);
    };
    
    // Internal Methods
    // --------------
    
    // The `Cannon._fetch` method is the gunpowder of the Cannon. It handles fetching URLs, reloading, and creating the final `projectileBlob`.
    this._fetch = function (callback, projectileBlob, queryData) { 
        if (self.limitInt && self.fetches++ == self.limitInt) {
            callback(projectileBlob, self);
            return;
        }
        
        queryData = queryData? queryData: {};
        
        var handle = function (data) {         
            self.rawData.push(data);
            var projectilePartial = self._getField([data], self.projectileStr);
            
            if (self._isArray(projectilePartial)) {
                if (!projectileBlob) {
                    projectileBlob = [];   
                }
                for (var p = 0; p<projectilePartial.length; p++) {
                    projectileBlob.push(projectilePartial[p]);   
                }
            }
            
            var reloaders = {};
            var hasReloader = false;
            
            for (var reloaderKey in self.reloaderStrs) {
                var reloader = self.reloaderStrs[reloaderKey];
                reloaders[reloaderKey] = self._getField([data], self.reloaderStrs[reloaderKey])[0];  
                hasReloader = reloaders[reloaderKey] || hasReloader;
            }
            
            if (hasReloader) {
                setTimeout(function () {
                    self._fetch(callback, projectileBlob, reloaders);
                }, self.delayInt);
            }else{
                callback(projectileBlob, self);
                return;
            }
        };
        
        this._getURL(self.url, queryData).then(handle);
    };
    
    
    // The `Cannon._getField` method is the method used to parse and fetch data pased on a `projectileStr` (or `fieldStr`). This method takes an array of pools, a field string, and an optional target.
    this._getField = function (pools, fieldsStr, target) {
        var fields = fieldsStr.split('.');
        var targets = [];
        
        for (var f=0; f<fields.length; f++) {
            var field = fields[f];
            var newPools = [];
            
            for (var p=0; p<pools.length; p++) {
                var pool = pools[p];
                if (field == "*") {
                    var child;
                    if (self._isArray(pools)) {
                        for (child=0; child<pool.length; child++) {
                            newPools.push(pool[child]);
                            if (pool[child] == target) {
                                targets.push(pool);
                            }
                        }
                    }
                    else {
                        for (child in pool) {
                            newPools.push(pool[child]);
                            if (pool[child] == target) {
                                targets.push(pool);
                            }
                        }
                    }
                }
                else if (pool[field]) {
                    newPools.push(pool[field]);
                    if (pool[field] == target) {
                        targets.push(pool);
                    }
                }
            }
            pools = newPools;
        }
        
        if (target) {
            return targets;   
        }else{
            return pools;
        }
    };
    
    
    // The `Cannon._getURL` method is our XHR wrapper used for requesting data.
    this._getURL = function (src, data) {
        var deferred = self._defer();
        var queryPairs = [];
        var queryString = "";
        
        for (var field in data) {
            queryPairs.push(field + "=" + data[field]);
        }
        
        if (queryPairs.length) {
            queryString = "?" + queryPairs.join("&");
        }
        
        function reqListener (res) {
            deferred.resolve(JSON.parse(res.responseText || res.currentTarget.responseText));
        }
        
        var xhr = new XMLHttpRequest();
        xhr.onload = reqListener;
        xhr.open("get", src + queryString, true);
        xhr.send(); 
        
        return deferred.promise;
    };
    
    // The `Cannon._defer` is a minimalist promise implemtation used in `Cannon._getURL`.
    this._defer = function () {
        var local = {};
        
        local.promise = {
            then: function (callback) {
                local.callback = callback;
                if (local.resolved) {
                    local.finish();
                }
            }
        };
        
        local.resolve = function () {
            local.args = arguments;
            if (local.callback) {
                local.finish();
            }
            local.resolved = true;
        };
        
        local.finish = function () {
            local.callback.apply(self, local.args);
        };
        
        return local;
    };
    
    this._isArray = function (obj) {
        return toString.call(obj) == '[object Array]';        
    };
    
    return this;
};