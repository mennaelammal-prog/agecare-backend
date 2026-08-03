"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    res.json({ success: true, messages: [] });
});
exports.default = router;
//# sourceMappingURL=message.routes.js.map