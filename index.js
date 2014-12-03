var webdriver = require('selenium-webdriver');
var jasmineCore = require('jasmine-core');
var env = jasmineCore.getEnv();
var jasmineInterface = jasmineCore.interface(jasmineCore, env);

var flow = webdriver.promise.controlFlow();

/**
 * Wrap a Jasmine matcher function so that it can take webdriverJS promises.
 * @param {!Function} matcher The matcher function to wrap.
 * @param {webdriver.promise.Promise} actualPromise The promise which will
 *     resolve to the actual value being tested.
 * @param {boolean} not Whether this is being called with 'not' active.
 */
function wrapMatcher(matcher, actualPromise, not) {
  return function() {
    var originalArgs = arguments;
    var matchError = new Error("Failed expectation");
    matchError.stack = matchError.stack.replace(/ +at.+jasminewd.+\n/, '');
    actualPromise.then(function(actual) {
      var expected = originalArgs[0];

      var expectation = originalExpect(actual);
      if (not) {
        expectation = expectation.not;
      }
      var originalAddMatcherResult = expectation.spec.addMatcherResult;
      var error = matchError;
      expectation.spec.addMatcherResult = function(result) {
        result.trace = error;
        jasmine.Spec.prototype.addMatcherResult.call(this, result);
      };

      if (webdriver.promise.isPromise(expected)) {
        if (originalArgs.length > 1) {
          throw error('Multi-argument matchers with promises are not ' +
              'supported.');
        }
        expected.then(function(exp) {
          expectation[matcher].apply(expectation, [exp]);
          expectation.spec.addMatcherResult = originalAddMatcherResult;
        });
      } else {
        expectation.spec.addMatcherResult = function(result) {
          result.trace = error;
          originalAddMatcherResult.call(this, result);
        };
        expectation[matcher].apply(expectation, originalArgs);
        expectation.spec.addMatcherResult = originalAddMatcherResult;
      }
    });
  };
}

/**
 * Return a chained set of matcher functions which will be evaluated
 * after actualPromise is resolved.
 * @param {webdriver.promise.Promise} actualPromise The promise which will
 *     resolve to the actual value being tested.
 */
function promiseMatchers(actualPromise) {
  var promises = {not: {}};
  var env = jasmine.getEnv();
  var matchersClass = env.currentSpec.matchersClass || env.matchersClass;

  for (var matcher in matchersClass.prototype) {
    promises[matcher] = wrapMatcher(matcher, actualPromise, false);
    promises.not[matcher] = wrapMatcher(matcher, actualPromise, true);
  }

  return promises;
}

jasmineInterface.expect = function(actual) {
  if (actual instanceof webdriver.WebElement) {
    throw 'expect called with WebElement argument, expected a Promise. ' +
    'Did you mean to use .getText()?';
  }
  if (webdriver.promise.isPromise(actual)) {
    return promiseMatchers(actual);
  } else {
    return env.expect(actual);
  }
};
