const XLSX = require('xlsx');
const fs = require('fs-extra');
const path = require('path');
const dataStore = require('./src/data');
 
async function exportUsersToExcel() {
    try {
        const messages = dataStore.getMessages();
        const uniqueUsers = new Map();
 
        // Extract unique users from messages
        messages.forEach(msg => {
            if (msg.sender && msg.contactId && msg.sender !== 'Bot' && msg.sender !== 'System') {
                const phone = msg.contactId.split('@')[0];
                if (phone && phone.length >= 10) {
                    const formattedPhone = '+91' + phone.replace(/^91/, '');
                    uniqueUsers.set(phone, {
                        name: msg.sender,
                        phone: formattedPhone,
                        date: msg.time || new Date().toLocaleDateString()
                    });
                }
            }
        });
 
        const users = Array.from(uniqueUsers.values());
        if (users.length === 0) {
            throw new Error('No users found');
        }
 
        // Sort users by date (newest first)
        users.sort((a, b) => new Date(b.date) - new Date(a.date));
 
        // Create a new workbook
        const wb = XLSX.utils.book_new();
       
        // Format the data with headers
        const data = [
            ['Name', 'Phone Number', 'Last Contact Date'], // Headers
            ...users.map(user => [user.name, user.phone, user.date]) // Data
        ];
       
        // Create worksheet from the data
        const ws = XLSX.utils.aoa_to_sheet(data);
       
        // Style the header row
        const headerStyle = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'E0E0E0' } },
            border: {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            }
        };
       
        // Apply header style
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell_address = { c: C, r: 0 };
            const cell_ref = XLSX.utils.encode_cell(cell_address);
            if (!ws[cell_ref]) ws[cell_ref] = {};
            ws[cell_ref].s = headerStyle;
        }
       
        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, // Name
            { wch: 20 }, // Phone
            { wch: 20 }  // Date
        ];
       
        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Users');
       
        // Create a buffer from the workbook
        const buffer = XLSX.write(wb, {
            bookType: 'xlsx',
            type: 'buffer',
            bookSST: true,
            cellStyles: true
        });
       
        return {
            success: true,
            data: buffer,
            userCount: users.length
        };
    } catch (error) {
        console.error('Error exporting users:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
 
module.exports = { exportUsersToExcel };