import pandas as pd
import os
import psycopg2
from psycopg2 import extras
import numpy as np
from dotenv import load_dotenv

# load the CSV files into Pandas
print("Loading CSVs...")
df_acquisitions = pd.read_csv('mysql_import.csv')
df_images = pd.read_csv('mysql_images.csv')

"""df_acquisitions.head(1)
first_id = df_acquisitions.iloc[0]['acquisition_id']
df_images[df_images['acquisition_id'] == first_id]
df_images.head(1)"""

# rename 'date' to 'acquisition_date' to match with SQL table
df_acquisitions = df_acquisitions.rename(columns={'date': 'acquisition_date'})

# replace NaN (Not a Number) with None so PostgreSQL registers them as NULL
df_acquisitions = df_acquisitions.replace({np.nan: None})
df_images = df_images.replace({np.nan: None})

# Load hidden variable from the .env file
load_dotenv()
CONNECTION_STRING = os.getenv("CONNECTION_STRING")

# quick check
if not CONNECTION_STRING:
  raise ValueError("Missing CONNECTION_STRING! Check your .env file.")

print("Connecting to Neon DB...")
conn = psycopg2.connect(CONNECTION_STRING)
cursor = conn.cursor()

# let's proceed with items insertion
try:

  # --- TABLE 1: Acquisitions ---
  print("Inserting Items into Acquisitions Table...")
  acquisitions_data = df_acquisitions[['acquisition_id', 'acquisition_date', 'bbox', 'platform', 'gsd', 'grid_code', 'instruments', 'datatake_id', 'processing_facility']].values.tolist()

  extras.execute_batch(cursor,
                       """
                       INSERT INTO Acquisitions (acquisition_id, acquisition_date, bbox, platform, gsd, grid_code, instruments, datatake_id, processing_facility)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (acquisition_id) DO NOTHING;
                       """,
                       acquisitions_data) # ON CONFLICT DO NOTHING ignores the new row and move on to the next one in case there's a row with this exact 'acquisition_id' (because 'acquisition_id' is the PK)

  # --- TABLE 2: Land ---
  print("Inserting Items into Land Table...")
  land_data = df_acquisitions[['acquisition_id', 'water_pct', 'vegetation_pct', 'dark_area_pct', 'not_vegetated_pct', 'nodata_pct', 'unclassified', 'snow_pct']].values.tolist()
  extras.execute_batch(cursor,
                       """
                       INSERT INTO Land (acquisition_id, water_pct, vegetation_pct, dark_area_pct, not_vegetated_pct, nodata_pct, unclassified, snow_pct)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (acquisition_id) DO NOTHING;
                       """,
                       land_data)

  # --- TABLE 3: Cloud ---
  print("Inserting Items into Cloud Table...")
  cloud_data = df_acquisitions[['acquisition_id', 'high_proba_clouds', 'medium_proba_clouds', 'cloud_shadow', 'thin_cirrus']].values.tolist()
  extras.execute_batch(cursor,
                       """
                       INSERT INTO Cloud (acquisition_id, high_proba_clouds, medium_proba_clouds, cloud_shadow, thin_cirrus)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (acquisition_id) DO NOTHING;
                       """,
                       cloud_data)

  # --- TABLE 4: Illuminance ---
  print("Inserting Items into Illuminance Table...")
  illuminance_data = df_acquisitions[['acquisition_id', 'view_azimuth', 'view_sun_elevation', 'view_incidence_angle', 'sun_elevation', 'orbit_state']].values.tolist()
  extras.execute_batch(cursor,
                       """
                       INSERT INTO Illuminance (acquisition_id, view_azimuth, view_sun_elevation, view_incidence_angle, sun_elevation, orbit_state)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (acquisition_id) DO NOTHING;
                       """,
                       illuminance_data)

  # --- TABLE 5: Images ---
  print("Inserting Items into Images Table...")
  images_data = df_images[['acquisition_id', 'band_name', 'resolution', 'file_url']].values.tolist()
  extras.execute_batch(cursor,
                       """
                       INSERT INTO Images (acquisition_id, band_name, resolution, file_url)
                       VALUES (%s, %s, %s, %s)
                       """,
                       images_data)
  conn.commit()
  print("SUCCESS! All data are uploaded on Neon!")

except Exception as e:
  conn.rollback()
  print("ERROR: ", e)
finally:
  cursor.close()
  conn.close()