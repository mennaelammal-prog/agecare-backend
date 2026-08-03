"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    res.json({ success: true, message: 'Family link feature placeholder' });
});
exports.default = router;
//# sourceMappingURL=familyLink.routes.js.map