/*
Rust 정의 쿼리:
- function definitions
- struct definitions
- enum definitions
- trait definitions
- impl blocks
- type aliases
*/
export default `
(function_item
  name: (identifier) @name.definition.function) @definition.function

(struct_item
  name: (type_identifier) @name.definition.class) @definition.class

(enum_item
  name: (type_identifier) @name.definition.enum) @definition.enum

(trait_item
  name: (type_identifier) @name.definition.interface) @definition.interface

(impl_item
  trait: (type_identifier)? @name.definition.impl
  type: (type_identifier) @name.definition.type) @definition.type

(type_item
  name: (type_identifier) @name.definition.type) @definition.type
`;
