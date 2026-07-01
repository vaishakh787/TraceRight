import argparse
import csv
import os
import random
import uuid
from datetime import datetime, timedelta
import pymssql
import pandas as pd

# Configuration matrices matching Section 4.3 threat profiles
CITIES = {
    "BENGALURU": (12.9716, 77.5946),
    "NEW_YORK": (40.7128, -74.0060),
    "LONDON": (51.5074, -0.1278),
    "TOKYO": (35.6762, 139.6503),
    "MUMBAI": (19.0760, 72.8777)
}

def generate_qr_code():
    return "".join([str(random.randint(0, 9)) for _ in range(15)])

def generate_data():
    events = []
    base_time = datetime.utcnow()

    # 1. Normal Scans Profile: 40 QRs scanning twice daily in the same city
    print("[*] Generating Normal Scan profile telemetry...")
    for _ in range(40):
        qr = generate_qr_code()
        city_name, (lat, lon) = random.choice(list(CITIES.items()))
        for day in range(3):  # Simulate across 3 days
            for am_pm in [9, 17]:  # Scans around 9 AM and 5 PM
                scan_time = base_time - timedelta(days=day)
                scan_time = scan_time.replace(hour=am_pm, minute=random.randint(0, 59))
                events.append({
                    "eventId": str(uuid.uuid4()),
                    "occurredAt": scan_time.isoformat() + "Z",
                    "qrCode": qr,
                    "eventType": "CONSUMER_VALIDATE",
                    "latitude": lat + random.uniform(-0.01, 0.01),
                    "longitude": lon + random.uniform(-0.01, 0.01),
                    "locationLabel": f"{city_name}_Retail",
                    "actorId": f"usr_{random.randint(100, 999)}"
                })

    # 2. Clone Burst Profile: 5 QRs scanning 30 times in 15 minutes from diverse regions
    print("[*] Generating Clone Burst attack anomaly profiles...")
    for _ in range(5):
        qr = generate_qr_code()
        start_time = base_time - timedelta(hours=random.randint(1, 12))
        for _ in range(30):
            # Pick completely random global cities for every single scan
            city_name, (lat, lon) = random.choice(list(CITIES.items()))
            scan_time = start_time + timedelta(seconds=random.randint(0, 900)) # Within 15 mins
            events.append({
                "eventId": str(uuid.uuid4()),
                "occurredAt": scan_time.isoformat() + "Z",
                "qrCode": qr,
                "eventType": "DISPATCH",  # ⚡ FIXED: Aligned enum string to match API schema validation rules
                "latitude": lat,
                "longitude": lon,
                "locationLabel": f"Burst_{city_name}",
                "actorId": f"attacker_{random.randint(1, 5)}"
            })

    # 3. Teleport Profile: 5 QRs scanning thousands of km apart within 30 minutes
    print("[*] Generating Impossible Velocity Teleportation anomaly profiles...")
    for _ in range(5):
        qr = generate_qr_code()
        start_time = base_time - timedelta(hours=random.randint(12, 24))
        
        # Scan 1: London Hub
        events.append({
            "eventId": str(uuid.uuid4()),
            "occurredAt": start_time.isoformat() + "Z",
            "qrCode": qr,
            "eventType": "STOCK_AUDIT",
            "latitude": CITIES["LONDON"][0],
            "longitude": CITIES["LONDON"][1],
            "locationLabel": "London_Warehouse",
            "actorId": "staff_lon"
        })
        
        # Scan 2: Tokyo Hub (Impossible distance change within 20 minutes)
        teleport_time = start_time + timedelta(minutes=20)
        events.append({
            "eventId": str(uuid.uuid4()),
            "occurredAt": teleport_time.isoformat() + "Z",
            "qrCode": qr,
            "eventType": "CONSUMER_VALIDATE",
            "latitude": CITIES["TOKYO"][0],
            "longitude": CITIES["TOKYO"][1],
            "locationLabel": "Tokyo_Retail",
            "actorId": "consumer_tok"
        })

    return events

def save_to_csv(scans, filepath='data/features.csv'):
    """Save feature data to CSV for ML training"""
    os.makedirs('data', exist_ok=True)
    df = pd.DataFrame(scans)
    df.to_csv(filepath, index=False)
    print(f"Saved {len(scans)} records to {filepath}")

def load_to_database(events):
    # Reads database destination variables from the active environment variables
    server = os.getenv("DB_SERVER", "localhost")
    port = os.getenv("DB_PORT", "1433")
    database = os.getenv("DB_NAME", "ScanIntelligenceDB")
    user = os.getenv("DB_USER", "sa")
    password = os.getenv("DB_PASSWORD")

    print(f"[*] Initializing remote database sync layer targeting {server}:{port}...")
    
    conn = pymssql.connect(server=server, port=port, user=user, password=password, database=database)
    cursor = conn.cursor()
    
    insert_query = """
        INSERT INTO scan_events 
        (event_id, occurred_at, qr_code, event_type, latitude, longitude, location_label, actor_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    success_count = 0
    for e in events:
        try:
            # Reformat ISO string safely for MS SQL DateTime2 constraints
            db_time = e["occurredAt"].replace("Z", "")
            cursor.execute(insert_query, (
                e["eventId"], db_time, e["qrCode"], e["eventType"],
                e["latitude"], e["longitude"], e["locationLabel"], e["actorId"]
            ))
            success_count += 1
        except Exception as err:
            print(f"[-] Database insertion skipped for row entry: {err}")
            
    conn.commit()
    cursor.close()
    conn.close()
    print(f"[+] Sync lifecycle completed. Bulk-loaded {success_count} rows safely into engine destination.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TraceRight Synthetic Scenario Generator Pipeline")
    parser.add_argument("--load-db", action="store_true", help="Directly stream generated dataset into target database engine")
    args = parser.parse_args()

    generated_telemetry = generate_data()
    save_to_csv(generated_telemetry, "data/features.csv")

    if args.load_db:
        # Load local .env values for script run if running directly
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))
        load_to_database(generated_telemetry)