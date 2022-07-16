// eslint-ignore
export default `// A horse is a horse, of course, of course, but no one can talk to a horse, of course, unless, of course, the name of the horse is he Famous Mr. Ed

<template>
  <div id="app">
    <p>{{ message }}</p>
    <input v-model="message">
  </div>
</template>
<script>
export default {
  data:() => ({
    message: 'Hello Vue! This is a really, really, really, really, really, really, really long paragraph to exercise wordWrap.'
  })
}
</script>
<style>
#app {
  color: #2ecc71
}
</style>`;

// export default `<script>
// export default {
//   data:() => ({
//     message: 'Hello Vue!'
//   })
// }
// </script>
// `;
