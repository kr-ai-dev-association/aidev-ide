"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
JavaScript 정의 쿼리:
- function declarations
- class declarations
- method definitions
- variable declarations (const, let, var)
*/
exports.default = `
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

(class_declaration
  name: (identifier) @name.definition.class) @definition.class

(method_definition
  name: (property_identifier) @name.definition.method) @definition.method

(variable_declarator
  name: (identifier) @name.definition.variable) @definition.variable
`;
//# sourceMappingURL=javascript.js.map