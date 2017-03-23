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

/**
 * 对 promise 的状态进行改变的函数，改变后会自动检测状态并执行
 * 
 * @param  {Promise} promise 								需要改变状态的 promise
 * @param  {State} state   									变更为该状态
 * @param  {Promise|Thenable|value} value   resolve 的 value， reject 的 reason
 * @return {}         											不符合变更状态的条件是直接停止运行
 */
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

	// 每一次改变状态后执行一次 runner 函数
	runner(promise);
}

/**
 * 检测当前状态，如果不为 PENDING，则根据状态不同调用事先注册的函数
 * 所有的 then 方法中注册的函数均在此处执行
 * 
 * @param  {Promise} promise 	要执行的 promise
 * @return {}         				无返回值
 */
var runner = function (promise) {
	var promise1 = promise;

	if (promise1.state === validStates.PENDING) {
		return ;
	}

	// 根据规范： onFulfilled 和 onRejected 只有在执行环境堆栈仅包含平台代码时才可被调用
	// 此处使用工具中的 runAsync 实现
	Utils.runAsync(function () {
		while(promise1.queue.length) {
			var promise2 = promise1.queue.shift(),
				handler = null,
				value
			// 根据设置的状态调用对应的函数
			if (promise1.state === validStates.FULFILLED) {
				// 根据规范：如果 onFulfilled 不是函数且 promise1 成功执行， promise2 必须成功执行并返回相同的值
				// 此时 promise1 已经成功执行，如果 promise2 的 onFulfilled 不是函数，我们则直接使用该默认函数，返回相同值
				handler = Utils.isFunction(promise2.onFulfilled) ?
					promise2.onFulfilled :
					function(v) { return v };
			} else if (promise1.state === validStates.REJECTED) {
				// 根据规范： 如果 onRejected 不是函数且 promise1 拒绝执行， promise2 必须拒绝执行并返回相同的据因
				// 此时状态为 rejected ，promsie1 已经拒绝执行，如果 promise2 的 onRejected 不是函数，则直接使用相同原因拒绝执行
				handler = Utils.isFunction(promise2.onRejected) ?
					promise2.onRejected :
					function(e) { throw e };
			}

			// 根据规范： 如果 onFulfilled 或者 onRejected 抛出一个异常 e ，则 promise2 必须拒绝执行，并返回拒因 e
			try {
				// 根据规范： onFulfilled 和 onRejected 必须被作为函数调用（即没有 this 值）
				value = handler(promise1.value)
			} catch(e) {
				// 此时捕捉到执行期的异常，以此 reject promise2
				promise2.reject(e)
				// 继续运行后续的 promise
				continue
			}
			// 根据规范： 如果 onFulfilled 或者 onRejected 返回一个值 x ，则运行下面的 Promise 解决过程：[[Resolve]](promise2, x)
			// 执行 Resolve 过程
			doResolve(promise2, value)
		}
	})
}

/**
 * 核心的 Resolve 函数，需输入一个 promise 和一个值，我们表示为 [[Resolve]](promise, x)，
 * 如果 x 有 then 方法且看上去像一个 Promise ，解决程序即尝试使 promise 接受 x 的状态；否则其用 x 的值来执行 promise 。
 * 这种 thenable 的特性使得 Promise 的实现更具有通用性：只要其暴露出一个遵循 Promise/A+ 协议的 then 方法即可；
 * 这同时也使遵循 Promise/A+ 规范的实现可以与那些不太规范但可用的实现能良好共存。
 * 
 * @param  {Promise} 					promise 需要处理的 promise
 * @param  {Value | Thenable} x       resolve 的值
 * @return {}        									无返回值
 */
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
	promise.onFulfilled = onFulfilled;
	promise.onRejected = onRejected;

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
