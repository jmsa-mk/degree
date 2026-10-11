<?php
// Copy to config.local.php on the API host only. Never ship credentials in the EXE.
return ['host'=>'127.0.0.1','port'=>3306,'database'=>'degree',
    'username'=>'degreebee_app','password'=>'CHANGE_ME'];
