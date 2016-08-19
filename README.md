# angularjs-combo-box
angular 1.x directive allowing input in a natively styled select

This project is obviously not well documented yet, but we're starting by adding ad hoc bullets to Usage Notes as we encounter the need for documentation.

## Usage Notes
  * Accepts base options via options attribute.
    * Example 1: ```<combobox ng-model="someVar" options="[{value: 'only value'}]"></combobox>```
    * Example 1: ```<combobox ng-model="someVar" options="ctrl.opts"></combobox>```
  * Watches options *reference*, not its value, so
    * This works in controller: ```this.opts = this.opts.concat([{value: 'second option'}]);```
    * But this does not work: ```this.opts.push({value: 'second option'});```
    * In other words, replace push/unshift with concat and replace pop/shift with slice.
