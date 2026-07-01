import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib
import json
import os

# The 10 features in exact order as specified in the blueprint
FEATURE_ORDER = [
    'scans_last_1h',
    'scans_last_24h', 
    'scans_last_7d',
    'distinct_actor_ids_24h',
    'distinct_event_types_24h',
    'minutes_since_prev_scan',
    'geo_jump_km',
    'implied_speed_kmh',
    'night_scan_ratio_7d',
    'consumer_validate_share_7d'
]

def compute_features(df):
    """Compute the 10 features from raw scan data for each QR code"""
    features = []
    
    # Convert occurred_at to datetime
    df['occurred_at'] = pd.to_datetime(df['occurred_at'])
    
    now = df['occurred_at'].max()
    time_1h = now - pd.Timedelta(hours=1)
    time_24h = now - pd.Timedelta(hours=24)
    time_7d = now - pd.Timedelta(days=7)
    
    for qr_code, group in df.groupby('qr_code'):
        group = group.sort_values('occurred_at')
        
        # Feature 1, 2, 3: Scan counts
        scans_1h = len(group[group['occurred_at'] >= time_1h])
        scans_24h = len(group[group['occurred_at'] >= time_24h])
        scans_7d = len(group[group['occurred_at'] >= time_7d])
        
        # Feature 4: Distinct actors in 24h
        distinct_actors = group[group['occurred_at'] >= time_24h]['actor_id'].nunique()
        
        # Feature 5: Distinct event types in 24h
        distinct_event_types = group[group['occurred_at'] >= time_24h]['event_type'].nunique()
        
        # Feature 6: Minutes since previous scan
        if len(group) >= 2:
            last_two = group.tail(2)['occurred_at'].values
            minutes_since = (last_two[1] - last_two[0]) / np.timedelta64(1, 'm')
        else:
            minutes_since = 9999
        
        # Feature 7 & 8: Geo jump and implied speed
        geo_jump_km = 0
        implied_speed_kmh = 0
        
        geo_group = group.dropna(subset=['latitude', 'longitude'])
        if len(geo_group) >= 2:
            last_two = geo_group.tail(2)
            lat1 = last_two.iloc[0]['latitude']
            lon1 = last_two.iloc[0]['longitude']
            lat2 = last_two.iloc[1]['latitude']
            lon2 = last_two.iloc[1]['longitude']
            
            # Haversine formula
            R = 6371
            dLat = np.radians(lat2 - lat1)
            dLon = np.radians(lon2 - lon1)
            a = np.sin(dLat/2)**2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dLon/2)**2
            geo_jump_km = R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
            
            time_diff_hours = (last_two.iloc[1]['occurred_at'] - last_two.iloc[0]['occurred_at']).total_seconds() / 3600
            if time_diff_hours > 1/60:
                implied_speed_kmh = geo_jump_km / time_diff_hours
        
        # Feature 9: Night scan ratio (00:00 - 05:00 UTC)
        night_scans = group[group['occurred_at'] >= time_7d]
        if len(night_scans) > 0:
            night_ratio = len(night_scans[night_scans['occurred_at'].dt.hour < 5]) / len(night_scans)
        else:
            night_ratio = 0
        
        # Feature 10: Consumer validate share
        scans_7d_group = group[group['occurred_at'] >= time_7d]
        if len(scans_7d_group) > 0:
            consumer_share = len(scans_7d_group[scans_7d_group['event_type'] == 'CONSUMER_VALIDATE']) / len(scans_7d_group)
        else:
            consumer_share = 0
        
        features.append({
            'qr_code': qr_code,
            'scans_last_1h': scans_1h,
            'scans_last_24h': scans_24h,
            'scans_last_7d': scans_7d,
            'distinct_actor_ids_24h': distinct_actors,
            'distinct_event_types_24h': distinct_event_types,
            'minutes_since_prev_scan': minutes_since,
            'geo_jump_km': geo_jump_km,
            'implied_speed_kmh': implied_speed_kmh,
            'night_scan_ratio_7d': night_ratio,
            'consumer_validate_share_7d': consumer_share
        })
    
    return pd.DataFrame(features)

def train_model(features_df):
    """Train the Isolation Forest model"""
    X = features_df[FEATURE_ORDER].values
    
    model = IsolationForest(
        n_estimators=100,
        contamination=0.1,  # Expect ~10% anomalies
        random_state=42
    )
    model.fit(X)
    
    # Calculate min/max decision function for normalization
    scores = model.decision_function(X)
    min_df = float(scores.min())
    max_df = float(scores.max())
    
    return model, min_df, max_df

if __name__ == '__main__':
    # ⚡ FIXED: Calculate absolute base project directory path dynamically relative to file location
    # train.py is located at packages/ml/train.py, so going up 3 levels targets the TraceRight root directory.
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    csv_path = os.path.join(BASE_DIR, 'data', 'features.csv')
    print(f"Loading data from: {csv_path}")
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Seeded features baseline missing at {csv_path}. Please execute data seeders first.")

    df = pd.read_csv(csv_path)
    df = df.rename(columns={
        'eventId': 'event_id',
        'occurredAt': 'occurred_at',
        'qrCode': 'qr_code',
        'eventType': 'event_type',
        'locationLabel': 'location_label',
        'actorId': 'actor_id'
    })
    print(f"Loaded {len(df)} raw scan records for {df['qr_code'].nunique()} QR codes")
    
    print("Computing features...")
    features_df = compute_features(df)
    print(f"Computed features for {len(features_df)} QR codes")
    
    print("Training Isolation Forest model...")
    model, min_df, max_df = train_model(features_df)
    
    # Save the model relative to dynamically computed BASE_DIR
    models_dir = os.path.join(BASE_DIR, 'models')
    os.makedirs(models_dir, exist_ok=True)
    model_output_path = os.path.join(models_dir, 'iforest-v1.joblib')
    joblib.dump(model, model_output_path)
    print(f"Model saved to: {model_output_path}")
    
    # Save metrics metadata context relative to dynamically computed BASE_DIR
    reports_dir = os.path.join(BASE_DIR, 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    metrics = {
        'feature_order': FEATURE_ORDER,
        'min_df': min_df,
        'max_df': max_df,
        'num_training_samples': len(features_df),
        'model_version': 'iforest-v1'
    }
    metrics_output_path = os.path.join(reports_dir, 'metrics.json')
    with open(metrics_output_path, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved to: {metrics_output_path}")
    
    print("\n🎉 Training run complete! Paths aligned safely.")
    print(f"Min decision function: {min_df:.4f}")
    print(f"Max decision function: {max_df:.4f}")