public class LinkedStack<T> {
    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value, Node<T> next) {
            this.value = value;
            this.next = next;
        }
    }

    private Node<T> head;
    private int count;

    public void push(T value) {
        head = new Node<>(value, head);
        count++;
    }

    public T pop() {
        if (head == null) {
            return null;
        }
        T result = head.value;
        head = head.next;
        count--;
        return result;
    }

    public T peek() {
        return head == null ? null : head.value;
    }

    public boolean isEmpty() {
        return head == null;
    }

    public int size() {
        return count;
    }

    public static void main(String[] args) {
        LinkedStack<String> s = new LinkedStack<>();
        s.push("a");
        s.push("b");
        s.push("c");
        System.out.println("size = " + s.size());
        while (!s.isEmpty()) {
            System.out.println(s.pop());
        }
    }
}
