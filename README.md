# CAPEX y OPEX 2026

MVP 0.1.3 para 14 Técnicas Sucursales. Aplicación estática para GitHub Pages.

## Prueba local

Descomprime el paquete, abre una terminal en la carpeta extraída y ejecuta:

```bash
python -m http.server 8000
```

Abre http://localhost:8000. La app requiere que los archivos se sirvan por HTTP.

## Flujo de jefatura

1. Selecciona la Técnica Sucursal y pulsa **Iniciar planificación**. Si ya tienes acciones guardadas, pulsa **Continuar planificación**.
2. Agrega una acción, selecciona un trimestre y completa CAPEX y OPEX. Guarda la acción.
3. Usa **Editar** para corregir una acción. Las acciones guardadas permanecen en el navegador por sucursal. Usa **Descargar borrador** y **Subir borrador** para trasladar la planificación en formato JSON.
4. **Limpiar todo** borra la planificación local de la sucursal seleccionada tras pedir confirmación.
5. Carga el **FORMATO CAPEX OPEX 2026v2.xlsx** original en blanco. Abre **Ver vista previa** y descarga el Excel individual. Usa ese Excel para la entrega al revisor.

**Cerrar sesión** vuelve al selector inicial. La jefatura puede guardar el borrador en el navegador o revisar y descargar el Excel v2 antes de salir. Si hay una acción abierta, debe guardarla o cancelar su edición. El administrador vuelve al selector con **Cerrar sesión**.

## Flujo de revisión

Selecciona **admin**, ingresa la clave de prueba entregada con esta versión y abre **Consolidar entregas Excel**. Carga la plantilla original en blanco y luego los Excel de las sucursales. La app valida el formato y el detalle trimestral. Una entrega corregida puede reemplazar la anterior con confirmación. Puedes previsualizar con una parte de las entregas. La descarga del consolidado se habilita al completar las 14. Conserva los Excel de origen hasta terminar la revisión, ya que la lista de importaciones se mantiene durante la sesión.

## Parámetros y publicación

El catálogo inicial usa las tarifas de fibra y postes de la hoja 2026 y las tarifas de las partidas adicionales de la hoja Calculo CAPEX. Las tarifas de personal y los rendimientos provienen de las fórmulas históricas y de las reglas acordadas.

El administrador puede preparar una nueva versión de `parametros.json` desde **Parámetros generales**. Los cambios se aplican a todos al sustituir el archivo publicado con una cuenta que tenga permiso de escritura sobre el repositorio. La clave de esta versión separa las pantallas en el navegador. El permiso de publicación se controla en GitHub. Una publicación pública en GitHub Pages permite consultar los parámetros del sitio.

Para publicar en GitHub Pages, sube el contenido de esta carpeta a la raíz del repositorio y configura esa raíz como origen de Pages. Antes de hacerlo, verifica que esté autorizada la publicación de los nombres y tarifas incluidos. El Excel v2 original se carga localmente y no va en el repositorio. Los datos de trabajo y las entregas se procesan en el navegador.
