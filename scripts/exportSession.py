import os
import sys
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION_NAME = os.environ.get("TG_SESSION_NAME", "tg_user_session")

if not API_ID or not API_HASH:
    print("Error: Please set TG_API_ID and TG_API_HASH environment variables.")
    sys.exit(1)

with TelegramClient(SESSION_NAME, API_ID, API_HASH) as client:
    string_session = StringSession.save(client.session)
    print("SESSION_STRING_START")
    print(string_session)
    print("SESSION_STRING_END")
