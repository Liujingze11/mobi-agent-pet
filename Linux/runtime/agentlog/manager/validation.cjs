"use strict";

function validationError(message) {
  const error = new Error(message);
  error.code = "INVALID_ARGUMENT";
  return error;
}

function boundedText(value, { name, max, required = false }) {
  if (value === undefined) {
    if (required) throw validationError(`${name} is required`);
    return "";
  }
  if (typeof value !== "string") throw validationError(`${name} must be a string`);
  const result = value.trim();
  if (required && !result) throw validationError(`${name} is required`);
  if (result.length > max) throw validationError(`${name} is too long`);
  return result;
}

function directoryPath(value, fsApi) {
  const result = boundedText(value, { name: "path", max: 4096, required: true });
  try {
    if (!fsApi.statSync(result).isDirectory()) throw validationError("path must be a directory");
    return fsApi.realpathSync(result);
  } catch (error) {
    if (error && error.code === "INVALID_ARGUMENT") throw error;
    throw validationError("path must be an existing directory");
  }
}

function optionalEnum(value, { name, values }) {
  if (value === undefined) return undefined;
  const result = boundedText(value, { name, max: 64, required: true });
  if (!values.includes(result)) throw validationError(`${name} is invalid`);
  return result;
}

function inputObject(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("input must be an object");
  }
  return value;
}

function optionalBoolean(value, { name }) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw validationError(`${name} must be a boolean`);
  return value;
}

function boundedInteger(value, { name, min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw validationError(`${name} is invalid`);
  }
  return value;
}

function requiredId(value, name = "id") {
  return boundedText(value, { name, max: 128, required: true });
}

function optionalText(value, options) {
  return value === undefined ? undefined : boundedText(value, options);
}

module.exports = Object.freeze({
  boundedInteger,
  boundedText,
  directoryPath,
  inputObject,
  optionalBoolean,
  optionalEnum,
  optionalText,
  requiredId,
  validationError,
});
