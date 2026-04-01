-- CREATE THE MAIN TABLE
CREATE TABLE Acquisitions (
    acquisition_id VARCHAR(255) PRIMARY KEY,
    acquisition_date TIMESTAMP NOT NULL,
    bbox TEXT NOT NULL,
    platform VARCHAR(50) NOT NULL,
    gsd INT,
    grid_code VARCHAR(50) NOT NULL,
    instruments TEXT NOT NULL,
    datatake_id VARCHAR(255) NOT NULL,
    processing_facility VARCHAR(100)
);

-- CREATE THE 1:1 RELATION BETWEEN Acquisitions AND Land
CREATE TABLE Land (
    acquisition_id VARCHAR(255) PRIMARY KEY REFERENCES Acquisitions(acquisition_id) ON DELETE CASCADE,
    water_pct DOUBLE PRECISION,
    vegetation_pct DOUBLE PRECISION,
    dark_area_pct DOUBLE PRECISION,
    not_vegetated_pct DOUBLE PRECISION,
    nodata_pct DOUBLE PRECISION,
    unclassified DOUBLE PRECISION,
    snow_pct DOUBLE PRECISION
);

-- CREATE THE 1:1 RELATION BETWEEN Acquisitions AND Cloud
CREATE TABLE Cloud (
    acquisition_id VARCHAR(255) PRIMARY KEY REFERENCES Acquisitions(acquisition_id) ON DELETE CASCADE,
    high_proba_clouds DOUBLE PRECISION,
    medium_proba_clouds DOUBLE PRECISION,
    cloud_shadow DOUBLE PRECISION,
    thin_cirrus DOUBLE PRECISION
);

-- CREATE THE 1:1 RELATION BETWEEN Acquisitions AND Illuminance
CREATE TABLE Illuminance (
    acquisition_id VARCHAR(255) PRIMARY KEY REFERENCES Acquisitions(acquisition_id) ON DELETE CASCADE,
    view_azimuth DOUBLE PRECISION,
    view_sun_elevation DOUBLE PRECISION,
    view_incidence_angle DOUBLE PRECISION,
    sun_elevation DOUBLE PRECISION,
    orbit_state VARCHAR(50)
);

-- CREATE THE 1:N RELATION BETWEEN Acquisitions AND Images
CREATE TABLE Images (
    image_id SERIAL PRIMARY KEY, 
    acquisition_id VARCHAR(255) NOT NULL REFERENCES Acquisitions(acquisition_id) ON DELETE CASCADE,
    band_name VARCHAR(50) NOT NULL,
    resolution VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL
);