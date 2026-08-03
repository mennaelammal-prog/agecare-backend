"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    res.json({ success: true, careNotes: [] });
});
router.post('/', async (req, res) => {
    const { content } = req.body;
    res.status(201).json({ success: true, content });
});
exports.default = router;
//# sourceMappingURL=careNote.routes.js.map