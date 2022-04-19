const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const calcularFecha = require('./assets/calcularFecha');

// Usos de paquetes y middleware
require('dotenv').config(); /* Permite el uso de .env */

const bcrypt = require('bcrypt'); /* Encriptacion de datos */
const saltRounds = 10;

const app = express();
app.use(express.json());
app.use(cors());

function validarLargoNota(req, res, next) {
  console.log('entando a middleware de validacion');

  if (req.body.cuerpoNota.length > 40) {
    res.status(401).send('error-largo');
  } else {
    next();
  }
}

const db  = mysql.createPool({
  connectionLimit : 10,
  acquireTimeout  : 10000,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.BD_PASS,
  database: process.env.DB_DATABASE, 
}); 
 
// Funciones server / rutas 
// const port = process.env.PORT || 3030
app.listen( process.env.PORT || 3030, err => { /* process.env.PORT es para el servidor de heroku una vez subido */
  if(err) throw err;
  else console.log("Servidor -J- iniciado");
}); 

app.get('/', (req, res) => {
  res.send('<h1>DB de Juli!</h1>');
});

app.get('/prueba', (req, res) => {
  const query = `SELECT * FROM Vista_usuarios WHERE nombreUsuario = juli` ;
  db.query(query, async (err, resultado) => {
    if(err)
      console.log('error J en server al logear', err);
    else {              
      console.log('ACCESO PERMITIDO');
      res.send({  /* Traje TODO pero envio solo los datos deseados */
        ID_usuario: resultado[0].ID_usuario,
        nombreUsuario: resultado[0].nombreUsuario,
        cantNotas: resultado[0].cantNotas,
        imagenUsuario: resultado[0].imagenUsuario,
        fechaRegistro: resultado[0].fechaRegistro,
      });
    }
  });
});
 

/*------------------------------------------------------------------------------------------------------------------------*/


/* Login de usuario */
app.post('/login/', (req, res) => { 
  /* 1ro recibo los datos ingresados en el input */
  const {nombreUsuario, passUsuario} = req.body;

  /* 2do traigo el usuario buscando segun el nombre ingresado y comparo (desencriptando) con el hash almacenado */
    const query = buscarUsuarioPorNombre(nombreUsuario); 
    db.query(query, async (err, resultado) => {
      if(err)
        console.log('error J en server al logear', err);
      else {
        if(resultado.length > 0) {  /* Encontró al usuario - Falta comparar contraseña */
          console.log('USUARIO ENCONTRADO');
          
          const accesoCorrecto = await bcrypt.compare(passUsuario, resultado[0].passUsuario);
                   
          if (accesoCorrecto) { /* Comparacion de contraseñas */
            console.log('ACCESO PERMITIDO');
            res.send({  /* Traje TODO pero envio solo los datos deseados */
              ID_usuario: resultado[0].ID_usuario,
              nombreUsuario: resultado[0].nombreUsuario,
              cantNotas: resultado[0].cantNotas,
              imagenUsuario: resultado[0].imagenUsuario,
              fechaRegistro: resultado[0].fechaRegistro,
            });
          } else {
            console.log('ACCESO DENEGADO');
            res.send([]);
          }          

        } else {
          console.log('NONONO');
          res.send(resultado); /* Envia un array vacio */
        }  
      }
    });
  }); 


/* Registro de nuevo usuario */
app.post('/register/', async (req, res) => {
  const {nombreUsuario, mailUsuario, passUsuario} = req.body;

  /* Encriptar mail y pass */
  const mailHash = await bcrypt.hash(mailUsuario, saltRounds);
  const passHash = await bcrypt.hash(passUsuario, saltRounds);
  
  const query = insertarUsuarioHashEnBD(nombreUsuario, mailHash, passHash);

  /* Comprueba disponibilidad e inserta DATOS HASH en BD */
  db.query(query, (err, resultado) => {
    if(err){
      if (err.errno === 1062) {
        // console.log('ESE USUARIO YA EXISTE');  
        res.send('existente');
      } else {
        console.log('ERROR AL REGISTRAR', err);
        res.send('error');
      }
    }
    else {
      /* Tomo el ID que fue insertado en la tabla Hash */
      /* Genera los datos por defecto con ese ID (foto = null, notas = 0 y fecha hoy) */
      const idInsertada = resultado.insertId;
      
      generarNuevoUsuario(idInsertada);
      
      /* Una vez insertado en ambas tablas busco usuario para devolver e instanciar en app */
      db.query( buscarUsuarioPorID(idInsertada), (err2, resultado2) => {
        if (err2) {
          console.log('error J al buscar luego de registrar', err2);
        } else {
          res.send(resultado2[0]);
        }
      });
    }
  });
});

  
/* Agregar nueva nota */
app.post('/notas/nueva', validarLargoNota, (req, res) => {  /* validarLargoNota es middleware */
  const {tituloNota, cuerpoNota, ID_usuario} = req.body;

  const query = insertarNotaEnBD(tituloNota, cuerpoNota, ID_usuario);
  db.query(query, (err, resultado) => {
    if(err)
      if (err.errno === 1406) {
        console.log('ERROR, TITULO MUY LARGO en DB', err);
        res.send('error'); 
      } else {
        console.log('ERROR AL AGREGAR', err);
      }
    else {
      
      res.send(resultado);     
    }
  });
});
 

/* Muestra las notas de un usuario logeado */
app.post('/notas/mostrar', (req, res) => {
  const {ID_usuario} = req.body;
  const query = buscarNotasEnDB(ID_usuario); 
  db.query(query, (err, resultado) => {
    if(err) {
      console.log('error J en server al mostrar notas -', err);
      res.send(err);
    } else 
      res.send(resultado);

  }); 
});


/* Edicion de nota existente */
app.post('/notas/editar', (req, res) => {
  const {tituloNota, cuerpoNota, ID_nota} = req.body;
  const query = editarNota(tituloNota, cuerpoNota, ID_nota); 
  db.query(query, (err, resultado) => {
    if(err)
      if (err.errno === 1406) {
        console.log('ERROR, TITULO MUY LARGO', err);
        res.send('error'); 
      } else {
        console.log('error server J al editar nota', err.errno);
      }
    else {
      // console.log('NOTA EDITADA');
      res.send(resultado);     
    }
  }); 
});


/* Borrar nota existente */
app.post('/notas/borrar', (req, res) => {
 const {ID_nota} = req.body;
 const query = borrarNotaEnBD(ID_nota);
//  console.log('intentando borrar..');
 db.query(query, (err, resultado) => {
  if(err) {
    console.log('error J en server al borrar nota', err);
    res.send(err);
  } else {
    res.send(resultado);
    // console.log('borrado');
  }
 });
});


/* Cambiar foto de usuario (nueva o cambio) */
app.post('/usuario/cambiar-foto', (req, res) => {
  const {link, ID_usuario} = req.body; 
  const query = editarFotoPerfil(link, ID_usuario); 
  // console.log('cambiando foto');

  db.query(query, (err, resultado) => {
    if(err) {
      console.log('error J en server al cambiar foto', err);
      res.send(err);
    } else {
      res.send(resultado);
      // console.log('foto cambiada');
    }
  });
});


/* Borrar foto de usuario (deja en null) */
app.post('/usuario/borrar-foto', (req, res) => {
  const {ID_usuario} = req.body; 
  const query = borrarFotoPerfil(ID_usuario); 
  // console.log('borrando foto');

  db.query(query, (err, resultado) => {
    if(err) {
      console.log('error J en server al borrar foto', err);
      res.send(err);
    } else {
      res.send(resultado);
      // console.log('foto borrada');
    }
  });
});


/* Busca el usuario solo por ID (ya logeado) al cambiar o borrar imagen */
app.post('/usuario/buscar', (req,res) => {
  const {ID_usuario} = req.body
  const query = buscarUsuarioPorId(ID_usuario)
  // console.log('llamando usuario... again..')

  db.query(query, (err, resultado) => {
    if(err) {
      console.log('Error J en server al buscar usuario por id', err)
      res.send(err)
    } else {
      res.send(resultado)
      // console.log('usuario enviado al front');
    } 
  })
});


/* Buscar datos generalos */
app.get('/datos/traer', (req, res) => {
  const query = buscarDatos();
  // console.log('buscando datos generales');
  db.query(query, (err, resultado) => {
    if (err) {
      console.log('error J al buscar datos generales');
      res.send(err);
    } else {
      // console.log('datos enviados al front');
      res.send({
        datosNotas: resultado[0].cantidad,
        datosUsuarios: resultado[1].cantidad
       }); 
    }
  });
});


/* Suma o resta 1 a la cantidad global de notas dependiendo el parametro */
app.post('/datos/editarNotas', (req, res) => {
  const {operacion} = req.body;
  const query = editarDatos(operacion);

  db.query(query, (err, resultado) => {
    if (err) {
      console.log('Error J al editar cantidad de notas', err);
    } else {
      // console.log('realizando cambio de dato nota');
      res.send('Dato editado correctamente');
    }
  });
});


/* Suma 1 a la cantidad total de usuarios reigstrados */
app.post('/datos/editarUsuarios', (req, res) => {
  // console.log('Sumando 1 a datos de usuarios');
  const query = editarUsuarios();

  db.query(query, (err, resultado) => {
    if (err) {
      console.log('Error J al sumar 1 a datos de usuarios', err);
    } else {
      // console.log('Sumado un nuevo usuario');
      res.send('Dato editado correctamente');
    }
  });
});


app.post('/hashear', (req, res) => {
  const { palabra } = req.body;
  let hashJ;
  console.log('palabra:', palabra);

  bcrypt.hash(palabra, saltRounds, async (error, hash) => {
    if (error) {
      console.log(err);
    } else {
      hashJ = hash;
      console.log('hash J:', hashJ);

      const query = `INSERT INTO usuarios_hash VALUES (default, 'mail', 'pass');`;
      db.query(query, async (err, resultado) => {
        if (err) {
          console.log(err);
        } else {
          console.log(resultado);
        }
      });  
    }
  });

});

/*------------------------------------------------------------------------------------------------------------------------*/

// Queries
const buscarUsuarioEnDB = (nombreUsuario, passHash) => {
  return `
    SELECT ID_usuario, nombreUsuario, cantNotas, fechaRegistro, imagenUsuario 
    FROM Vista_usuarios 
    WHERE nombreUsuario = '${nombreUsuario}' AND passHash = '${passHash}';
  `;
}

const insertarUsuarioHashEnBD = (nombreUsuario, mailUsuario, passUsuario) => {
  // return`
  //   INSERT INTO Usuarios_hash VALUES (null, '${nombreUsuario}', '${mailUsuario}', '${passUsuario}');
  // `;
  return`
    INSERT INTO Datos_usuario VALUES (null, '${nombreUsuario}', '${mailUsuario}', '${passUsuario}');
  `;
} 

const buscarUsuarioPorID = (id) => { /* Busca en view y retorna usuario para instanciarlo en la app */
  return `
    SELECT ID_usuario, nombreUsuario, cantNotas, fechaRegistro, imagenUsuario 
    FROM Vista_usuarios
    WHERE ID_usuario = ${id};
  `;  
}

const buscarUsuarioPorNombre = (nombreUsuario) => { /* Busca en view y retorna usuario para instanciarlo en la app */
  return `
    SELECT * FROM Vista_usuarios WHERE nombreUsuario = '${nombreUsuario}';
  `;  
}

const insertarNotaEnBD = (tituloNota, cuerpoNota, ID_usuario) => {
  return`
    INSERT INTO Notas 
    VALUES (null, '${tituloNota}', '${cuerpoNota}', ${ID_usuario});
  `;
}

const buscarNotasEnDB = (ID_usuario) => {
  return`
    SELECT * FROM Notas WHERE ID_usuario = ${ID_usuario};
  `;
}

const editarNota = (tituloNota, cuerpoNota, id) => {
  return `
    UPDATE Notas 
    SET tituloNota = '${tituloNota}', cuerpoNota = '${cuerpoNota}'
    WHERE ID_nota = ${id};
  `;  
}

const borrarNotaEnBD = (ID_nota) => {
  return`
    DELETE FROM Notas WHERE ID_nota = ${ID_nota};
  `;
}

const editarFotoPerfil = (link, ID_usuario) => {
  return `
    UPDATE Usuarios SET imagenUsuario = '${link}' WHERE ID_usuario = ${ID_usuario};
  `
}

const borrarFotoPerfil = (ID_usuario) => {
  return `
    UPDATE Usuarios SET imagenUsuario = null WHERE ID_usuario = ${ID_usuario};
  `
}

const buscarUsuarioPorId = (ID_usuario) => {
  return `
  SELECT ID_usuario, nombreUsuario, cantNotas, fechaRegistro, imagenUsuario 
  FROM Vista_usuarios WHERE ID_usuario = ${ID_usuario};
  `
}

const buscarDatos = () => {
  return `SELECT * FROM Datos_app;`
}

const editarDatos = (operacion) => {
  return `
    UPDATE Datos_app SET cantidad = cantidad ${operacion} WHERE ID_dato = 1;
  `
}

const editarUsuarios = () => {
  return `
    UPDATE Datos_app SET cantidad = cantidad + 1 WHERE ID_dato = 2;
  `
} 

const generarNuevoUsuario = (idUsuario) => {
  const query = `INSERT INTO Usuarios VALUES (${idUsuario}, '${calcularFecha()}', 0, null);`
  db.query(query, (err, respuesta) => {
    if (err) {
      console.log('error J al generar usuario generico', err);
    } 
  });
} 

