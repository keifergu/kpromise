"use strict";
var immediate = require('immediate')

var validStates = {
	PENDING: 0,
	FULFILLED: 1,
	REJECTED: 2
}

var Utils = {
	isFunction: function (val) {
		return val && typeof val === "function";
	},
	isObject: function (obj) {
		return obj && typeof obj === "object";
	},
	isPromise: function (val) {
    return val && val.constructor === KPromise;
  },
	isValidState: function(state) {
		return (
			(state === validStates.PENDING) ||
      (state === validStates.REJECTED) ||
      (state === validStates.FULFILLED))
	},
	runAsync: function (func) {
		immediate(func)
	}
}

var transition = function (promise, state, value) {
	if (
			promise.state === state ||
	    arguments.length !== 3 ||
	    !Utils.isValidState(state) ||
	    promise.state !== validStates.PENDING) {
		return ;
	}

	promise.state = state;
	promise.value = value;
	runner(promise);
}

var runner = function (promise) {
	var that = promise;
	var fulfillFallBack = function (value) {
       return value;
     },
     rejectFallBack = function (reason) {
       throw reason;
     };
	// 最开始添加的 then 函数，此时 pengding 状态，直接返回
	if (that.state === validStates.PENDING) {
		return ;
	}

	Utils.runAsync(function () {
		while(that.queue.length) {
			var promiseItem = that.queue.shift(),
				handler = null,
				value
			// 根据设置的状态调用对应的函数
			if (that.state === validStates.FULFILLED) {
				handler = promiseItem.handlers.onFulfilled || fulfillFallBack; // 如果对应的函数没有设置的话，则使用默认函数
			} else if (that.state === validStates.REJECTED) {
				handler = promiseItem.handlers.onRejected || rejectFallBack;
			}

			try {
				value = handler(that.value)
			} catch(e) {
				promiseItem.reject(e)
				continue
			}

			doResolve(promiseItem, value)
		}
	})
}

var doResolve = function (promise, x) {

	if (promise === x) {
		var msg = "can't resolve the same Promise"
		promise.reject(new TypeError(msg))
	}
	// 当 resolve 的值 x 也是 promise 的时候
	// 当前 promise 的 state 则依赖 x 的 state
	else if (Utils.isPromise(x)) {
		if (x.state === validStates.PENDING) {
			// 在依赖的 promise 后添加 then 方法
			// 当其状态改变时，使用该 then 方法 改变当前 promise 状态
			x.then(function(val) {
				doResolve(promise, val)
			}, function(reason) {
				promise.reject(reason)
			})
		} else {
			// 当依赖的 promise 不是 PENDING 状态时
			// 则直接将其值和状态传递到当前 promise
			transition(promise, x.state, x.value)
		}
	}
	// 处理当 x 是对象或函数的情况
	else if (Utils.isObject(x) || Utils.isFunction(x)) {
		var called = false,
			thenHandler
		try {
			thenHandler = x.then
			if (Utils.isFunction(thenHandler)) {
				thenHandler.call(x,
					function (y) {
						if (!called) {
							doResolve(promise, y)
							called = true
						}
					}, 
					function(r) {
						if (!called) {
							promise.reject(r)
							called = true
						}
					}
				)
			} else {
				// then 不是函数 则以 x 为参数执行 promise
				promise.resolve(x)
				called = true
			}
		} catch(e) {
			// 取 x.then 值或调用 x.then 时抛出异常，
			// 则以该异常拒绝 promise
			if (!called) {
				promise.reject(e)
				called = true
			}
		}
	}
	// 当 x 不是对象或者函数时，以 x 为参数执行 promise
	else {
		promise.resolve(x)
	}
}

function KPromise (func) {
	var that = this;
	this.value = undefined;
	this.state = validStates.PENDING;
	this.queue = [];
	this.handlers = {
		onFulfilled: null,
		onRejected: null
	}
	if (Utils.isFunction(func)) {
		func(function (value) {
			doResolve(that, value)
		}, function (err) {
			that.reject(err)
		})
	}
};

KPromise.prototype.then = function (onFulfilled, onRejected) {
	var	promise = new KPromise();
	// 每个子 promise 会具有这两个属性
	// 代表的是通过 then 方法添加的回调
	if (Utils.isFunction(onFulfilled)) {
		promise.handlers.onFulfilled = onFulfilled;
	}
	if (Utils.isFunction(onRejected)) {
		promise.handlers.onRejected = onRejected;
	}

	this.queue.push(promise);
	runner(this);

	return promise;
}

KPromise.prototype.catch = function(onRejected) {
	return this.then(null, onRejected)
}

KPromise.prototype.resolve = function(value) {
	transition(this, validStates.FULFILLED, value)
}

KPromise.prototype.reject = function(reason) {
	transition(this, validStates.REJECTED, reason)
}

module.exports = {
    resolved: function (value) {
        return new KPromise(function (resolve) {
            resolve(value);
        });
    },
    rejected: function (reason) {
        return new KPromise(function (resolve, reject) {
            reject(reason);
        });
    },
    deferred: function () {
        var resolve, reject;

        return {
            promise: new KPromise(function (rslv, rjct) {
                resolve = rslv;
                reject = rjct;
            }),
            resolve: resolve,
            reject: reject
        };
    }
};
