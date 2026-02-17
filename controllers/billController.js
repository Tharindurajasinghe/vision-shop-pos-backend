const Bill = require('../models/Bill');
const Product = require('../models/Product');
const ActiveDay = require('../models/ActiveDay');
const moment = require('moment-timezone');

// Generate next bill ID
async function generateBillId() {
  const lastBill = await Bill.findOne().sort({ billId: -1 });
  if (!lastBill) return '10001';
  
  const nextId = parseInt(lastBill.billId) + 1;
  return nextId.toString();
}

const createBill = async (req, res) => {
  try {
    const { items, cash } = req.body;
    
    let totalAmount = 0;
    const billItems = [];
    
    for (const item of items) {
      // Use 'Standard' as default variant if not provided (BACKWARD COMPATIBLE)
      const finalVariant = item.variant || 'Standard';
      
      // Find product by productId and variant
      const product = await Product.findOne({ 
        productId: item.productId,
        variant: finalVariant
      });
      
      if (!product) {
        return res.status(400).json({ 
          message: `Product ${item.productId}${finalVariant !== 'Standard' ? ' (' + finalVariant + ')' : ''} not found` 
        });
      }
      
      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}${finalVariant !== 'Standard' ? ' (' + finalVariant + ')' : ''}. Available: ${product.stock}` 
        });
      }
      
      // Use the price provided by user (edited price) or default to selling price
      let finalPrice = item.price !== undefined ? item.price : product.sellingPrice;
      
      // Validate: edited price must be >= buying price
      if (finalPrice < product.buyingPrice) {
        return res.status(400).json({ 
          message: `Price for ${product.name}${finalVariant !== 'Standard' ? ' (' + finalVariant + ')' : ''} cannot be less than buying price (Rs.${product.buyingPrice})` 
        });
      }
      
      const itemTotal = finalPrice * item.quantity;
      totalAmount += itemTotal;
      
      billItems.push({
        productId: product.productId,
        name: product.name,
        variant: finalVariant,
        quantity: item.quantity,
        price: finalPrice,  // Store the actual selling price (possibly edited)
        buyingPrice: product.buyingPrice,  // Store buying price for profit calculation
        total: itemTotal
      });
      
      // Reduce stock
      product.stock -= item.quantity;
      await product.save();
    }
    
    if (cash < totalAmount) {
      return res.status(400).json({ message: 'Insufficient cash' });
    }

    const change = cash - totalAmount;
    
    // Use Sri Lanka timezone for everything
    const now = moment().tz('Asia/Colombo');
    const billId = await generateBillId();
    const dayIdentifier = now.format('YYYY-MM-DD');
    const time = now.format('hh:mm A');
    
    const bill = new Bill({
      billId,
      items: billItems,
      totalAmount,
      date: now.toDate(),
      time,
      cash,
      change,
      dayIdentifier
    });
    
    await bill.save();
    
    let activeDay = await ActiveDay.findOne({ date: dayIdentifier });
    if (!activeDay) {
      activeDay = new ActiveDay({
        date: dayIdentifier,
        startedAt: now.toDate(),
        currentTotal: totalAmount
      });
    } else {
      activeDay.currentTotal += totalAmount;
    }
    await activeDay.save();
    
    res.status(201).json(bill);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Get all bills for today
const getTodayBills = async (req, res) => {
  try {
    const today = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
    const bills = await Bill.find({ dayIdentifier: today }).sort({ createdAt: 1 });
    res.json(bills);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get bills by date
const getBillsByDate = async (req, res) => {
  try {
    const bills = await Bill.find({ dayIdentifier: req.params.date }).sort({ createdAt: 1 });
    res.json(bills);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get bill by ID
const getBillById = async (req, res) => {
  try {
    const bill = await Bill.findOne({ billId: req.params.billId });
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    res.json(bill);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get bills for past 30 days
const getPast30DaysBills = async (req, res) => {
  try {
    const today = new Date();
    const past30Days = new Date(today);
    past30Days.setDate(past30Days.getDate() - 29);
    
    const bills = await Bill.find({
      date: { $gte: past30Days, $lte: today }
    }).sort({ date: -1 });
    
    res.json(bills);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete bill by billId (BACKWARD COMPATIBLE - handles bills with/without variants)
const deleteBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await Bill.findOne({ billId });

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Restore stock for each item variant
    for (const item of bill.items) {
      const product = await Product.findOne({ 
        productId: item.productId,
        variant: item.variant || 'Standard'  // Backward compatible
      });
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }

    // Update ActiveDay if today
    const today = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
    if (bill.dayIdentifier === today) {
      const activeDay = await ActiveDay.findOne({ date: today });
      if (activeDay) {
        activeDay.currentTotal -= bill.totalAmount;
        if (activeDay.currentTotal < 0) activeDay.currentTotal = 0;
        await activeDay.save();
      }
    }

    // Delete the bill
    await bill.deleteOne();

    res.json({ message: 'Bill deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createBill,
  getTodayBills,
  getBillsByDate,
  getBillById,
  getPast30DaysBills,
  deleteBill
};