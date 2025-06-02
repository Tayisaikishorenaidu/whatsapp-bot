# WhatsApp Bot with Smart Replies

A WhatsApp automation bot that provides smart replies with options for different types of responses, including media attachments and customer support integration.

## Features

- **Smart Reply Options**: Automatically sends a menu of options to users
- **Media Support**: Can send images, audio, and video responses
- **Customer Support Integration**: Option to connect users with support staff
- **Web Dashboard**: Monitor conversations and manage media
- **Configurable Settings**: Customize reply delay and other settings

## Options for Users

1. **Welcome Information**: Sends welcome message with picture and voice message
2. **Sign-up Video**: Sends a video guide for signing up
3. **Customer Support**: Connects user with support staff via WhatsApp

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the application:
   ```
   npm start
   ```

3. Scan the QR code with your WhatsApp to authenticate

4. Access the dashboard at: http://localhost:3000

## Adding Media

Use the web dashboard to upload:
- Welcome images
- Audio messages
- Sign-up videos

## Configuration

You can configure the following settings via the dashboard:
- Reply delay (default: 120 seconds)
- Enable/disable auto-reply
- Support WhatsApp number
