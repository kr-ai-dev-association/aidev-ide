"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
Java 정의 쿼리:
- class declarations
- interface declarations
- method declarations
- enum declarations
*/
exports.default = `
(class_declaration
  name: (identifier) @name.definition.class) @definition.class

(interface_declaration
  name: (identifier) @name.definition.interface) @definition.interface

(method_declaration
  name: (identifier) @name.definition.method) @definition.method

(enum_declaration
  name: (identifier) @name.definition.enum) @definition.enum
`;
//# sourceMappingURL=java.js.map