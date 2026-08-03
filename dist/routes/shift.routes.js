"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shifts_service_1 = require("../modules/shifts/shifts.service");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    const shifts = await (0, shifts_service_1.getShifts)();
    res.json({ success: true, shifts });
});
router.post('/', async (req, res) => {
    const shift = await (0, shifts_service_1.createShift)(req.body);
    res.status(201).json({ success: true, shift });
});
exports.default = router;
//# sourceMappingURL=shift.routes.js.map