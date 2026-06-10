-- Seed: Copa do Mundo 2026 - Fase de Grupos
-- 48 seleções em 12 grupos de 4

INSERT INTO matches (match_number, home_team, away_team, home_team_flag, away_team_flag, match_date, stage, group_name, venue, city) VALUES

-- GRUPO A
(1,  'México',    'Equador',      '🇲🇽', '🇪🇨', '2026-06-11 20:00:00-03', 'Fase de Grupos', 'A', 'Estadio Azteca',          'Cidade do México'),
(2,  'Alemanha',  'Marrocos',     '🇩🇪', '🇲🇦', '2026-06-11 23:00:00-03', 'Fase de Grupos', 'A', 'SoFi Stadium',            'Los Angeles'),
(3,  'México',    'Alemanha',     '🇲🇽', '🇩🇪', '2026-06-15 17:00:00-03', 'Fase de Grupos', 'A', 'Estadio Azteca',          'Cidade do México'),
(4,  'Equador',   'Marrocos',     '🇪🇨', '🇲🇦', '2026-06-15 20:00:00-03', 'Fase de Grupos', 'A', 'Rose Bowl',               'Los Angeles'),
(5,  'Equador',   'Alemanha',     '🇪🇨', '🇩🇪', '2026-06-19 20:00:00-03', 'Fase de Grupos', 'A', 'Rose Bowl',               'Los Angeles'),
(6,  'México',    'Marrocos',     '🇲🇽', '🇲🇦', '2026-06-19 20:00:00-03', 'Fase de Grupos', 'A', 'Estadio Azteca',          'Cidade do México'),

-- GRUPO B
(7,  'Brasil',    'Croácia',      '🇧🇷', '🇭🇷', '2026-06-12 17:00:00-03', 'Fase de Grupos', 'B', 'MetLife Stadium',         'Nova York'),
(8,  'Argentina', 'Nigéria',      '🇦🇷', '🇳🇬', '2026-06-12 23:00:00-03', 'Fase de Grupos', 'B', 'AT&T Stadium',            'Dallas'),
(9,  'Brasil',    'Argentina',    '🇧🇷', '🇦🇷', '2026-06-16 20:00:00-03', 'Fase de Grupos', 'B', 'MetLife Stadium',         'Nova York'),
(10, 'Croácia',   'Nigéria',      '🇭🇷', '🇳🇬', '2026-06-16 17:00:00-03', 'Fase de Grupos', 'B', 'AT&T Stadium',            'Dallas'),
(11, 'Brasil',    'Nigéria',      '🇧🇷', '🇳🇬', '2026-06-20 20:00:00-03', 'Fase de Grupos', 'B', 'MetLife Stadium',         'Nova York'),
(12, 'Argentina', 'Croácia',      '🇦🇷', '🇭🇷', '2026-06-20 20:00:00-03', 'Fase de Grupos', 'B', 'AT&T Stadium',            'Dallas'),

-- GRUPO C
(13, 'França',    'Bolívia',      '🇫🇷', '🇧🇴', '2026-06-12 14:00:00-03', 'Fase de Grupos', 'C', 'Levi''s Stadium',         'São Francisco'),
(14, 'Espanha',   'Camarões',     '🇪🇸', '🇨🇲', '2026-06-12 20:00:00-03', 'Fase de Grupos', 'C', 'Hard Rock Stadium',       'Miami'),
(15, 'França',    'Espanha',      '🇫🇷', '🇪🇸', '2026-06-16 23:00:00-03', 'Fase de Grupos', 'C', 'Levi''s Stadium',         'São Francisco'),
(16, 'Bolívia',   'Camarões',     '🇧🇴', '🇨🇲', '2026-06-16 14:00:00-03', 'Fase de Grupos', 'C', 'Hard Rock Stadium',       'Miami'),
(17, 'Bolívia',   'Espanha',      '🇧🇴', '🇪🇸', '2026-06-20 14:00:00-03', 'Fase de Grupos', 'C', 'Levi''s Stadium',         'São Francisco'),
(18, 'França',    'Camarões',     '🇫🇷', '🇨🇲', '2026-06-20 14:00:00-03', 'Fase de Grupos', 'C', 'Hard Rock Stadium',       'Miami'),

-- GRUPO D
(19, 'Portugal',  'Arábia S.',    '🇵🇹', '🇸🇦', '2026-06-13 17:00:00-03', 'Fase de Grupos', 'D', 'Estadio Akron',           'Guadalajara'),
(20, 'Colômbia',  'Japão',        '🇨🇴', '🇯🇵', '2026-06-13 20:00:00-03', 'Fase de Grupos', 'D', 'Gillette Stadium',        'Boston'),
(21, 'Portugal',  'Colômbia',     '🇵🇹', '🇨🇴', '2026-06-17 20:00:00-03', 'Fase de Grupos', 'D', 'Gillette Stadium',        'Boston'),
(22, 'Arábia S.', 'Japão',        '🇸🇦', '🇯🇵', '2026-06-17 17:00:00-03', 'Fase de Grupos', 'D', 'Estadio Akron',           'Guadalajara'),
(23, 'Arábia S.', 'Colômbia',     '🇸🇦', '🇨🇴', '2026-06-21 20:00:00-03', 'Fase de Grupos', 'D', 'Estadio Akron',           'Guadalajara'),
(24, 'Portugal',  'Japão',        '🇵🇹', '🇯🇵', '2026-06-21 20:00:00-03', 'Fase de Grupos', 'D', 'Gillette Stadium',        'Boston'),

-- GRUPO E
(25, 'Inglaterra','Irã',          '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇮🇷', '2026-06-13 14:00:00-03', 'Fase de Grupos', 'E', 'Lincoln Financial Field', 'Filadélfia'),
(26, 'EUA',       'Senegal',      '🇺🇸', '🇸🇳', '2026-06-13 23:00:00-03', 'Fase de Grupos', 'E', 'Lumen Field',             'Seattle'),
(27, 'Inglaterra','EUA',          '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇺🇸', '2026-06-17 14:00:00-03', 'Fase de Grupos', 'E', 'Lincoln Financial Field', 'Filadélfia'),
(28, 'Irã',       'Senegal',      '🇮🇷', '🇸🇳', '2026-06-17 23:00:00-03', 'Fase de Grupos', 'E', 'Lumen Field',             'Seattle'),
(29, 'Irã',       'EUA',          '🇮🇷', '🇺🇸', '2026-06-21 14:00:00-03', 'Fase de Grupos', 'E', 'Lincoln Financial Field', 'Filadélfia'),
(30, 'Inglaterra','Senegal',      '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇸🇳', '2026-06-21 14:00:00-03', 'Fase de Grupos', 'E', 'Lumen Field',             'Seattle'),

-- GRUPO F
(31, 'Holanda',   'Tunísia',      '🇳🇱', '🇹🇳', '2026-06-14 14:00:00-03', 'Fase de Grupos', 'F', 'BC Place',                'Vancouver'),
(32, 'Bélgica',   'Coreia do S.', '🇧🇪', '🇰🇷', '2026-06-14 17:00:00-03', 'Fase de Grupos', 'F', 'BMO Field',               'Toronto'),
(33, 'Holanda',   'Bélgica',      '🇳🇱', '🇧🇪', '2026-06-18 14:00:00-03', 'Fase de Grupos', 'F', 'BC Place',                'Vancouver'),
(34, 'Tunísia',   'Coreia do S.', '🇹🇳', '🇰🇷', '2026-06-18 17:00:00-03', 'Fase de Grupos', 'F', 'BMO Field',               'Toronto'),
(35, 'Tunísia',   'Bélgica',      '🇹🇳', '🇧🇪', '2026-06-22 17:00:00-03', 'Fase de Grupos', 'F', 'BC Place',                'Vancouver'),
(36, 'Holanda',   'Coreia do S.', '🇳🇱', '🇰🇷', '2026-06-22 17:00:00-03', 'Fase de Grupos', 'F', 'BMO Field',               'Toronto'),

-- GRUPO G
(37, 'Uruguai',   'Iraque',       '🇺🇾', '🇮🇶', '2026-06-14 20:00:00-03', 'Fase de Grupos', 'G', 'Arrowhead Stadium',       'Kansas City'),
(38, 'Suíça',     'África do S.', '🇨🇭', '🇿🇦', '2026-06-14 23:00:00-03', 'Fase de Grupos', 'G', 'Estadio Universitario',   'Monterrey'),
(39, 'Uruguai',   'Suíça',        '🇺🇾', '🇨🇭', '2026-06-18 20:00:00-03', 'Fase de Grupos', 'G', 'Arrowhead Stadium',       'Kansas City'),
(40, 'Iraque',    'África do S.', '🇮🇶', '🇿🇦', '2026-06-18 23:00:00-03', 'Fase de Grupos', 'G', 'Estadio Universitario',   'Monterrey'),
(41, 'Iraque',    'Suíça',        '🇮🇶', '🇨🇭', '2026-06-22 20:00:00-03', 'Fase de Grupos', 'G', 'Arrowhead Stadium',       'Kansas City'),
(42, 'Uruguai',   'África do S.', '🇺🇾', '🇿🇦', '2026-06-22 20:00:00-03', 'Fase de Grupos', 'G', 'Estadio Universitario',   'Monterrey'),

-- GRUPO H
(43, 'Canadá',    'Austrália',    '🇨🇦', '🇦🇺', '2026-06-15 14:00:00-03', 'Fase de Grupos', 'H', 'BMO Field',               'Toronto'),
(44, 'Turquia',   'Egito',        '🇹🇷', '🇪🇬', '2026-06-15 20:00:00-03', 'Fase de Grupos', 'H', 'NRG Stadium',             'Houston'),
(45, 'Canadá',    'Turquia',      '🇨🇦', '🇹🇷', '2026-06-19 14:00:00-03', 'Fase de Grupos', 'H', 'BMO Field',               'Toronto'),
(46, 'Austrália', 'Egito',        '🇦🇺', '🇪🇬', '2026-06-19 17:00:00-03', 'Fase de Grupos', 'H', 'NRG Stadium',             'Houston'),
(47, 'Austrália', 'Turquia',      '🇦🇺', '🇹🇷', '2026-06-23 17:00:00-03', 'Fase de Grupos', 'H', 'BMO Field',               'Toronto'),
(48, 'Canadá',    'Egito',        '🇨🇦', '🇪🇬', '2026-06-23 17:00:00-03', 'Fase de Grupos', 'H', 'NRG Stadium',             'Houston'),

-- GRUPO I
(49, 'Itália',    'Venezuela',    '🇮🇹', '🇻🇪', '2026-06-15 17:00:00-03', 'Fase de Grupos', 'I', 'Mercedes-Benz Stadium',   'Atlanta'),
(50, 'Dinamarca', 'Jordânia',     '🇩🇰', '🇯🇴', '2026-06-15 23:00:00-03', 'Fase de Grupos', 'I', 'State Farm Stadium',      'Phoenix'),
(51, 'Itália',    'Dinamarca',    '🇮🇹', '🇩🇰', '2026-06-19 17:00:00-03', 'Fase de Grupos', 'I', 'Mercedes-Benz Stadium',   'Atlanta'),
(52, 'Venezuela', 'Jordânia',     '🇻🇪', '🇯🇴', '2026-06-19 23:00:00-03', 'Fase de Grupos', 'I', 'State Farm Stadium',      'Phoenix'),
(53, 'Venezuela', 'Dinamarca',    '🇻🇪', '🇩🇰', '2026-06-23 20:00:00-03', 'Fase de Grupos', 'I', 'Mercedes-Benz Stadium',   'Atlanta'),
(54, 'Itália',    'Jordânia',     '🇮🇹', '🇯🇴', '2026-06-23 20:00:00-03', 'Fase de Grupos', 'I', 'State Farm Stadium',      'Phoenix'),

-- GRUPO J
(55, 'Polônia',   'Eslovênia',    '🇵🇱', '🇸🇮', '2026-06-16 14:00:00-03', 'Fase de Grupos', 'J', 'Empower Field',           'Denver'),
(56, 'Argélia',   'Chile',        '🇩🇿', '🇨🇱', '2026-06-16 20:00:00-03', 'Fase de Grupos', 'J', 'Q2 Stadium',              'Austin'),
(57, 'Polônia',   'Argélia',      '🇵🇱', '🇩🇿', '2026-06-20 14:00:00-03', 'Fase de Grupos', 'J', 'Empower Field',           'Denver'),
(58, 'Eslovênia', 'Chile',        '🇸🇮', '🇨🇱', '2026-06-20 17:00:00-03', 'Fase de Grupos', 'J', 'Q2 Stadium',              'Austin'),
(59, 'Eslovênia', 'Argélia',      '🇸🇮', '🇩🇿', '2026-06-24 17:00:00-03', 'Fase de Grupos', 'J', 'Empower Field',           'Denver'),
(60, 'Polônia',   'Chile',        '🇵🇱', '🇨🇱', '2026-06-24 17:00:00-03', 'Fase de Grupos', 'J', 'Q2 Stadium',              'Austin'),

-- GRUPO K
(61, 'Áustria',   'Albânia',      '🇦🇹', '🇦🇱', '2026-06-17 14:00:00-03', 'Fase de Grupos', 'K', 'Estadio BBVA',            'Monterrey'),
(62, 'Sérvia',    'Costa Rica',   '🇷🇸', '🇨🇷', '2026-06-17 23:00:00-03', 'Fase de Grupos', 'K', 'Camping World Stadium',   'Orlando'),
(63, 'Áustria',   'Sérvia',       '🇦🇹', '🇷🇸', '2026-06-21 17:00:00-03', 'Fase de Grupos', 'K', 'Estadio BBVA',            'Monterrey'),
(64, 'Albânia',   'Costa Rica',   '🇦🇱', '🇨🇷', '2026-06-21 23:00:00-03', 'Fase de Grupos', 'K', 'Camping World Stadium',   'Orlando'),
(65, 'Albânia',   'Sérvia',       '🇦🇱', '🇷🇸', '2026-06-25 20:00:00-03', 'Fase de Grupos', 'K', 'Estadio BBVA',            'Monterrey'),
(66, 'Áustria',   'Costa Rica',   '🇦🇹', '🇨🇷', '2026-06-25 20:00:00-03', 'Fase de Grupos', 'K', 'Camping World Stadium',   'Orlando'),

-- GRUPO L
(67, 'Escócia',   'Panamá',       '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇵🇦', '2026-06-18 14:00:00-03', 'Fase de Grupos', 'L', 'SoFi Stadium',            'Los Angeles'),
(68, 'Costa do M.','Paraguai',    '🇨🇮', '🇵🇾', '2026-06-18 20:00:00-03', 'Fase de Grupos', 'L', 'Allegiant Stadium',       'Las Vegas'),
(69, 'Escócia',   'Costa do M.', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇨🇮', '2026-06-22 14:00:00-03', 'Fase de Grupos', 'L', 'SoFi Stadium',            'Los Angeles'),
(70, 'Panamá',    'Paraguai',     '🇵🇦', '🇵🇾', '2026-06-22 20:00:00-03', 'Fase de Grupos', 'L', 'Allegiant Stadium',       'Las Vegas'),
(71, 'Panamá',    'Costa do M.', '🇵🇦', '🇨🇮', '2026-06-26 20:00:00-03', 'Fase de Grupos', 'L', 'SoFi Stadium',            'Los Angeles'),
(72, 'Escócia',   'Paraguai',     '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🇵🇾', '2026-06-26 20:00:00-03', 'Fase de Grupos', 'L', 'Allegiant Stadium',       'Las Vegas'),

-- OITAVAS DE FINAL (Round of 32)
(73, 'A1', 'B2', '🏳️', '🏳️', '2026-07-01 17:00:00-03', 'Oitavas de Final', NULL, 'MetLife Stadium', 'Nova York'),
(74, 'C1', 'D2', '🏳️', '🏳️', '2026-07-01 21:00:00-03', 'Oitavas de Final', NULL, 'AT&T Stadium', 'Dallas'),
(75, 'E1', 'F2', '🏳️', '🏳️', '2026-07-02 17:00:00-03', 'Oitavas de Final', NULL, 'Hard Rock Stadium', 'Miami'),
(76, 'G1', 'H2', '🏳️', '🏳️', '2026-07-02 21:00:00-03', 'Oitavas de Final', NULL, 'SoFi Stadium', 'Los Angeles'),
(77, 'I1', 'J2', '🏳️', '🏳️', '2026-07-03 17:00:00-03', 'Oitavas de Final', NULL, 'Levi''s Stadium', 'São Francisco'),
(78, 'K1', 'L2', '🏳️', '🏳️', '2026-07-03 21:00:00-03', 'Oitavas de Final', NULL, 'Lincoln Financial Field', 'Filadélfia'),
(79, 'B1', 'A2', '🏳️', '🏳️', '2026-07-04 17:00:00-03', 'Oitavas de Final', NULL, 'Gillette Stadium', 'Boston'),
(80, 'D1', 'C2', '🏳️', '🏳️', '2026-07-04 21:00:00-03', 'Oitavas de Final', NULL, 'Rose Bowl', 'Los Angeles'),
(81, 'F1', 'E2', '🏳️', '🏳️', '2026-07-05 17:00:00-03', 'Oitavas de Final', NULL, 'BC Place', 'Vancouver'),
(82, 'H1', 'G2', '🏳️', '🏳️', '2026-07-05 21:00:00-03', 'Oitavas de Final', NULL, 'BMO Field', 'Toronto'),
(83, 'J1', 'I2', '🏳️', '🏳️', '2026-07-06 17:00:00-03', 'Oitavas de Final', NULL, 'NRG Stadium', 'Houston'),
(84, 'L1', 'K2', '🏳️', '🏳️', '2026-07-06 21:00:00-03', 'Oitavas de Final', NULL, 'Arrowhead Stadium', 'Kansas City'),
(85, 'M3', 'N3', '🏳️', '🏳️', '2026-07-07 17:00:00-03', 'Oitavas de Final', NULL, 'Estadio Azteca', 'Cidade do México'),
(86, 'O3', 'P3', '🏳️', '🏳️', '2026-07-07 21:00:00-03', 'Oitavas de Final', NULL, 'Mercedes-Benz Stadium', 'Atlanta'),
(87, 'Q3', 'R3', '🏳️', '🏳️', '2026-07-08 17:00:00-03', 'Oitavas de Final', NULL, 'Estadio Akron', 'Guadalajara'),
(88, 'S3', 'T3', '🏳️', '🏳️', '2026-07-08 21:00:00-03', 'Oitavas de Final', NULL, 'State Farm Stadium', 'Phoenix'),

-- QUARTAS DE FINAL
(89, 'QF1', 'QF2', '🏳️', '🏳️', '2026-07-11 17:00:00-03', 'Quartas de Final', NULL, 'MetLife Stadium', 'Nova York'),
(90, 'QF3', 'QF4', '🏳️', '🏳️', '2026-07-11 21:00:00-03', 'Quartas de Final', NULL, 'AT&T Stadium', 'Dallas'),
(91, 'QF5', 'QF6', '🏳️', '🏳️', '2026-07-12 17:00:00-03', 'Quartas de Final', NULL, 'Hard Rock Stadium', 'Miami'),
(92, 'QF7', 'QF8', '🏳️', '🏳️', '2026-07-12 21:00:00-03', 'Quartas de Final', NULL, 'SoFi Stadium', 'Los Angeles'),

-- SEMIFINAIS
(93, 'SF1', 'SF2', '🏳️', '🏳️', '2026-07-15 21:00:00-03', 'Semifinal', NULL, 'MetLife Stadium', 'Nova York'),
(94, 'SF3', 'SF4', '🏳️', '🏳️', '2026-07-16 21:00:00-03', 'Semifinal', NULL, 'AT&T Stadium', 'Dallas'),

-- TERCEIRO LUGAR
(95, '3°lugar1', '3°lugar2', '🏳️', '🏳️', '2026-07-19 17:00:00-03', 'Terceiro Lugar', NULL, 'Hard Rock Stadium', 'Miami'),

-- FINAL
(96, 'Finalista 1', 'Finalista 2', '🏳️', '🏳️', '2026-07-19 20:00:00-03', 'Final', NULL, 'MetLife Stadium', 'Nova York');
