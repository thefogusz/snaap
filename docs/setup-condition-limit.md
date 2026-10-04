# Setup condition limit

Setups support up to 20 leaf COMPARE conditions in total across entry, waiting stages, exit, cancel and independently authored Short conditions. AND/OR groups and HOLD wrappers do not count; an automatically mirrored Short template is counted once. A flat group may hold all 20 conditions.

The editor, API validation and AI guidance use this same limit. Existing nesting, stage and total tree-node bounds remain in place. Twenty conditions are accepted, while twenty-one are rejected before saving or proposing a setup. This change does not activate saved setups automatically.
