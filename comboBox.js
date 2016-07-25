/***
 * @ngDoc directive
 *
 * @description
 * Directive to create a combination of input text field and select/option dropdown.
 */
angular.module("angularjs-combo-box").directive('comboBox', ['$document', '$window', function($document, $window) {
	var userAgent = _.get($window, 'navigator.userAgent', '');
	var isWebkit = /WebKit/.test(userAgent) && !/Edge/.test(userAgent);

	return {
		restrict: 'E', // match element name only
		require: 'ngModel',

		// Attributes that map parent scope properties to isolate scope properties are commented below under scope: { ... }
		//
		// The following additional attributes are evaluated by the link function:
		//     options-watch-collection:  If present, options is watched via watchCollection().  Default is to watch reference.
		//     added-options-watch-collection:  If present, added-options is watched via watchCollection().  Default is to watch reference.
		//
		// Via the ngModel controller:
		//     ng-model:  String, two-way binding.  The currently-selected option value or user-entered text.
		//
		scope: {
			// base-options:  Array, one-way binding to reference.  Input only (array contents are not modified by this directive).
			baseOptions: '<options',

			// added-options:  Optional array, two-way binding to reference.  Array is created by this directive if (and only if) not present
			// on parent scope.  Array contents are updated by this directive as the user enters/adds new options.
			addedOptions: '=?',

			ngDisabled: '<?', // optional input value, one-way binding

			// The following are bound as input string values interpolated on the parent scope:
			optionsPlaceholder: "@?", // placeholder to show when options are available
			optionlessPlaceholder: "@?", // placeholder to show when options are not avialable
			comboClass: '@class' // additional classes for both sub-elements (<select> and <input>)
		},

		template: ' <select' +
		'  ng-change="onSelectChange()"' +
		'  ng-blur="onSelectBlur()"' +
		'  ng-click="onSelectClick()"' +
		'  ng-keydown="onSelectKeydown($event)"' +
		'  ng-model="model"' +
		'  ng-disabled="ngDisabled"' +
		'  class="{{comboClass}}"' +
		' >' +
		'  <option ng-repeat="n in allOptions" value="{{n}}">{{n}}</option>' +
		' </select>' +
		' <input' +
		'  type="text"' +
		'  ng-blur="addOption()"' +
		'  ng-keydown="onInputKeydown($event)"' +
		'  ng-keyup="refreshOptions()"' +
		'  ng-model="model"' +
		'  ng-disabled="ngDisabled"' +
		'  class="{{comboClass}}"' +
		'  ng-class="allOptions.length > 1 ?' + " 'shorterInput' : '' " + '" ' +
		' />',

		link: function(scope, element, attrs, ngModel) {
			var KEY_ENTER = 13, // Enter key (keydown event keyCode)
				KEY_ALT = 18, // Alt key
				KEY_ARROW_UP = 38, // Up Arrow
				KEY_ARROW_DOWN = 40, // Down Arrow
				EMPTY_ARRAY = [], // common empty array to reference so watch doesn't fire
				ENABLE_DEBUG_LOG = 0; // set to truthy value to log debugging messages to console

			var inputElement = element.find('input')[0],
				selectElement = element.find('select')[0],
				debugLog = ENABLE_DEBUG_LOG ? console.log.bind(console) : function() {},
				optionsVisible = false;

			if ($document.find('#comboBoxStyles').length === 0) {
				$document.find('head').append(
					' <style id="comboBoxStyles" type="text/css">' +
					' @charset "UTF-8";' +
					' combo-box {' +
					' 	display: block;' +
					' 	border: 0 !important;' +
					'   padding: 0 !important;' +
					' }' +
					' combo-box select {' +
					' 	display: block;' +
					'   border: inherit;' +
					'   border-radius: inherit;' +
					'   padding: 6px 12px;' +
					'   position: relative;' +
					'   width: 100% !important;' +
					'   height: 100% !important;' +
					' }' +
					' combo-box select[disabled] {' +
					'   opacity: 1 !important;' +
					' }' +
					' combo-box input[disabled] {' +
					'   color: rgba(0,0,0,0) !important;' +
					' 	background-color: transparent !important;' +
					' }' +
					' combo-box input {' +
					' 	display: block;' +
					' 	box-sizing: border-box;' +
					'   width: 100% !important;' +
					'   padding: 6px 12px;' +
					'   border: inherit;' +
					'   border-radius: inherit;' +
					'   height: 100%; !important;' +
					' 	border-color: transparent; !important;' +
					'   position: relative;' +
					'   top: -100%;' +
					' }' +
					' combo-box input.shorterInput {' +
					' 	width: calc(100% - 20px) !important;' +
					' 	background-color: white;' +
					' 	border-color: transparent;' +
					' 	background-clip: padding-box;' +
					' 	border-top-right-radius: 0;' +
					' 	border-bottom-right-radius: 0;' +
					' 	box-shadow: none;' +
					' }' +
					' @media all and (-ms-high-contrast: none), (-ms-high-contrast: active) {}' +
					' /* IE10, IE11 and Edge (Needed in addition to above, for some reason.) */' +
					' _:-ms-lang(x), combo-box input.shorterInput {' +
					'   width: calc(100% - 40px) !important;' +
					' } ' +
					' combo-box select:focus::-ms-value {' +
					'   background-color: inherit;' +
					' }' +
					' </style>'
				);
			}

			function toggleOptionsVisible() {
				optionsVisible = !optionsVisible;
			}

			// Execute callback when idle (outside of apply/digest cycle)
			function whenIdle(fn) {
				setTimeout(fn, 0);
			}

			// Fetch base options array from scope, if present, or a reference to an empty array
			function getBaseOptions() {
				return (scope.baseOptions && scope.baseOptions.constructor === Array) ? scope.baseOptions : EMPTY_ARRAY;
			}

			// Fetch added options array from scope.  Create the array if necessary.
			function getAddedOptions() {
				if (!scope.addedOptions || scope.addedOptions.constructor !== Array) {
					debugLog("combo-box attribute 'added-options' doesn't reference an existing array on parent scope; creating a new array for user-added options");
					scope.addedOptions = [];
				}
				return scope.addedOptions;
			}

			// Selects previous (shift = -1), next (shift = 1), or current (default, 0) option,
			// then focuses and emits a change event from the select element
			function changeAndFocusSelection(shift) {
				if (!shift) shift = 0;
				debugLog("changeAndFocusSelection(" + shift + ")");
				var changeEvent, idx;
				// Focus select so that Enter and Alt-<downarrow> behaves by browser-default.
				selectElement.focus();
				idx = selectElement.selectedIndex + shift;
				if (selectElement.options[idx]) {
					selectElement.selectedIndex = idx;
					changeEvent = $document[0].createEvent('Event');
					changeEvent.initEvent('change', false, true);
					whenIdle(function() { // dispatchEvent must be called outside of $apply since it causes an $apply
						selectElement.dispatchEvent(changeEvent);
					});
				}
			}

			// Merge base options with added options and a blank.
			// The blank reminds the user that a new value can be entered.
			scope.refreshOptions = function() {
				var addedOptions = [];
				debugLog("refreshOptions(), root scope phase is '" + scope.$root.$$phase + "'");
				getAddedOptions().forEach(function(val) {
					if (getBaseOptions().indexOf(val) < 0) {
						addedOptions.push(val);
					}
				});
				scope.allOptions = addedOptions.concat(getBaseOptions());
				inputElement.setAttribute('placeholder', (scope.allOptions.length || scope.model)
						? (scope.optionsPlaceholder || '')
						: (scope.optionlessPlaceholder || '')
				);
				if (scope.model && scope.allOptions.indexOf(scope.model) < 0) {
					scope.allOptions.unshift(scope.model);
				}
				if (scope.allOptions.indexOf('') < 0) {
					scope.allOptions.unshift('');
				}
			};

			// Event handler for <input> keydown
			scope.onInputKeydown = function(e) {
				switch (e.keyCode) {
					case KEY_ENTER:
					case KEY_ALT: // Allow browsers like FF to open select with alt+downArrow.
						selectElement.focus();
						break;

					case KEY_ARROW_DOWN:
						// Prevent Firefox from scrolling
						e.preventDefault();
						e.stopPropagation();
						// Select next option
						changeAndFocusSelection(1);
						break;

					case KEY_ARROW_UP:
						// Prevent Firefox from scrolling
						e.preventDefault();
						e.stopPropagation();
						// Select prior option
						changeAndFocusSelection(-1);
						break;
				}
			};

			// Event handler for <select> keydown
			scope.onSelectKeydown = function(e) {
				var endLog;
				// Chrome does not emit keyboard events while options are displayed, and
				// we cannot detect this behavior as a feature yet, so until we can . . .
				switch (e.keyCode) {
					case KEY_ENTER:
						debugLog("onSelectKeydown ENTER, target.value = '" + e.target.value + "'" + ", optionsVisible = " + optionsVisible);
						endLog = true;
						whenIdle(function() {
							if (e.target.value === '') inputElement.focus(); // blank selected, focus text input
						});
						if (!e.altKey && isWebkit) {
							// Chrome uses enter key to toggle visibility of options (if alt not pressed), so track this.
							toggleOptionsVisible();
						}
						else if (!e.altKey) {
							optionsVisible = false;
						}
						break;

					case KEY_ARROW_UP:
					case KEY_ARROW_DOWN:
						debugLog("onSelectKeydown arrow up/down, Alt = " + e.altKey + ", optionsVisible = " + optionsVisible);
						endLog = true;
						if (e.altKey) {
							// If alt is pressed with arrow key, allow normal behavior (revealing options)
							// and track the state of the options:
							toggleOptionsVisible(); // Works for FF and IE.
							// Chrome does not emit keydown event while options are open, so toggle doesn't work there.
							// E.g. comment next lines, do alt+downarrowkey x3, click blank option: no blinking carat.
							if (isWebkit) {
								optionsVisible = true;
							}
						} else {
							// Just arrow key, so wait until change has occurred . . .
							whenIdle(function() {
								// Then, if options are not visible, emit change event.
								// (Most browsers do this already, but FF does not.)
								if (!optionsVisible) {
									changeAndFocusSelection();
								}
							});
						}
						break;
				}
				if (endLog) debugLog("END onSelectKeydown " + e.keyCode + ", optionsVisible = " + optionsVisible);
			};

			// Event handler for <select> change
			scope.onSelectChange = function() {
				debugLog("onSelectChange");
				// If value changes, options are hidden.
				// This overrides other indicators, so use whenIdle to ensure that
				// this is the final word about optionsVisible.
				whenIdle(function() {
					debugLog("onSelectChange setting optionsVisible to false");
					optionsVisible = false;
				});
			};

			// Event handler for <select> click
			scope.onSelectClick = function() {
				// First check if options are open
				// Otherwise it's a click to open the options.
				// Then, if value is blank, focus input to allow typing a new value.
				if (optionsVisible && !scope.model) {
					debugLog("onSelectClick focusing input element");
					inputElement.focus();
				}
				// Generally a click toggles option visibility, so track that.
				toggleOptionsVisible();
				debugLog("END onSelectClick, optionsVisible = " + optionsVisible);
			};

			// Capture model (text input value) as a user-added option
			scope.addOption = function() {
				var val = scope.model,
					base = getBaseOptions(),
					added = getAddedOptions();
				debugLog("addOption('" + val + "')");
				if (val && base.indexOf(val) < 0 && added.indexOf(val) < 0) {
					added.unshift(val);
					scope.refreshOptions();
				}
				else {
					debugLog("addOption did not change added options array");
				}
			};

			// Event handler for <select> blur (lost focus)
			scope.onSelectBlur = function() {
				// When select loses focus, the browser hides options.  Track this.
				debugLog("onSelectBlur setting optionsVisible to false");
				optionsVisible = false;
			};

			// Event handler for changes to base options from parent scope
			function onBaseOptionsChanged() {
				debugLog("base options changed on parent scope");
				scope.refreshOptions();
			}

			// Event handler for changes to added options from parent scope
			function onAddedOptionsChanged() {
				debugLog("added options changed on parent scope");
				scope.refreshOptions();
			}

			// Watch for changes to baseOptions propagating from parent scope
			if (attrs.optionsWatchCollection !== undefined) {
				debugLog("watching base options as a collection");
				scope.$watchCollection(getBaseOptions, onBaseOptionsChanged);
			} else {
				debugLog("watching base options as a reference");
				scope.$watch(getBaseOptions, onBaseOptionsChanged);
			}

			// Watch for changes to addedOptions propagating from parent scope
			if (attrs.addedOptionsWatchCollection !== undefined) {
				debugLog("watching added options as a collection");
				scope.$watchCollection(getAddedOptions, onAddedOptionsChanged);
			} else {
				debugLog("watching added options as a reference");
				scope.$watch(getAddedOptions, onAddedOptionsChanged);
			}

			// Connect ng-model to isolate scope model
			ngModel.$render = function() {
				scope.model = ngModel.$viewValue;
			};
			scope.$watch('model', function(newModel) {
				ngModel.$setViewValue(newModel);
			});
		} // end of link()
	}; // end of directive definition object
}]); // end of directive factory function
