"use strict";

const { app } = require("electron");
const { BRAND } = require("./brand.cjs");

app.setName(BRAND.productName);

require("../clawd/src/main.js");
