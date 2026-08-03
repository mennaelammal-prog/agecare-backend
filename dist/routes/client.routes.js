"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    res.json({ success: true, clients: [] });
});
router.post('/', async (req, res) => {
    const { name } = req.body;
    res.status(201).json({ success: true, name });
});
exports.default = router;
//# sourceMappingURL=client.routes.js.map