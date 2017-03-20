"use strict";

var validStates = {
	PENDING: 0,
	FULFILLED: 1,
	REJECTED: 2
}

isFunction: function(val) {
	return val && typeof val === "function";
}

KPomise.prototype.transition = function (state, value) {
	if(this.state === state ||this.state !== validStates.PENDING)
		throw('Must from PENDING to other state')
	if (state === validStates.FULFILLED && value)
		throw('FULFILLED must have value')
	if (state === validStates.REJECTED && value)
		throw('REJECTED must have reason')

	this.state = state;
	this.value = value;
}

var KPomise = function (fn) {
	var that = this;
	this.value = undefined;
	this.state = validStates.PENDING;
	this.queue = [];
	fn(function resolve(value) {
		doResolve(that, value)
	}, function reject(error) {
		doReject(that, error)
	})
};

var doResolve = function (that, value) {
	that.state = validStates.FULFILLED;
	that.queue.reduce(function(acc, cuv) {
		return cuv(acc)
	}, value)
}

var doReject = function (that, error) {
	
}


KPomise.prototype.then = function (onFulfilled, onRejected) {
	if (isFunction(onFulfilled)) {
		
	}
	if (isFunction(onRejected)) {}

	this.queue.push(onFulfilled)
}

module.exports = {
    resolved: function (value) {
        return new KPomise(function (resolve) {
            resolve(value);
        });
    },
    rejected: function (reason) {
        return new KPomise(function (resolve, reject) {
            reject(reason);
        });
    },
    deferred: function () {
        var resolve, reject;

        return {
            promise: new KPomise(function (rslv, rjct) {
                resolve = rslv;
                reject = rjct;
            }),
            resolve: resolve,
            reject: reject
        };
    }
};
