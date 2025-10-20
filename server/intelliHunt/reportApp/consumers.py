# reports/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ReportConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.report_group_name = "report_updates"

        # Join the update group
        await self.channel_layer.group_add(
            self.report_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        # Leave the update group
        await self.channel_layer.group_discard(
            self.report_group_name,
            self.channel_name
        )

    # Handler for messages sent by the API view (via group_send)
    async def report_update_message(self, event):
        message = event["message"]
        action = event["action"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message,
            "action": action
        }))