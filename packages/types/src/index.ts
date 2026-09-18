/**
 * @exiledata/types re-exports the canonical schema and adds thin wire-format types (API request
 * and response shapes) that wrap schema entities. It intentionally does not redefine entity
 * shapes — see @exiledata/schema for the canonical model and its conventions.
 */
export * from "@exiledata/schema";
export * from "./api.js";
export * from "./admin.js";
